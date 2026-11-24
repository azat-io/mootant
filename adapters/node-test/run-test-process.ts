import type { ChildProcess } from 'node:child_process'
import type { Writable } from 'node:stream'

import { closeSync, fstatSync, openSync, readSync } from 'node:fs'

import type { TestProcessOutcome } from './types/test-process-outcome'
import type { NodeTestRecord } from './types/node-test-record'
import type { ProcessWatch } from './types/process-watch'

import { stopProcessGroup } from '../shared/stop-process-group'
import { startTestProcess } from './start-test-process'
import { isGroupAlive } from './is-group-alive'

/**
 * Milliseconds between two reads of the out file.
 */
const POLL_INTERVAL = 50

/**
 * Milliseconds to wait for the output of a process to close after it exited,
 * before the process that still holds it, such as a detached one its tests
 * started, is left behind.
 */
const CLOSE_GRACE = 300

/**
 * How to start one test process and when to stop it.
 */
interface TestProcessOptions {
  /**
   * Epoch milliseconds past which the watchdog stops the process, from what is
   * known of it; `Infinity` for none.
   */
  deadline(watch: ProcessWatch): number

  /**
   * Receives what the process writes to stdout and stderr, as it arrives;
   * without it the output is dropped.
   */
  onOutput?(text: string): void

  /**
   * Environment variables of the process.
   */
  env: NodeJS.ProcessEnv

  /**
   * Spare process of the test file, started with file descriptor 3, to run
   * instead of a new one.
   */
  spare?: ChildProcess

  /**
   * Process groups of the session's test processes that run, which holds this
   * one's while it runs.
   */
  groups: Set<number>

  /**
   * Arguments after the Node binary.
   */
  args: string[]

  /**
   * The unit as JSON, sent on file descriptor 3 of the process; without it the
   * environment carries the unit, and the process gets no descriptor 3.
   */
  unit?: string

  /**
   * Node binary.
   */
  node: string

  /**
   * Absolute path of the out file the process appends records to; it exists and
   * is empty.
   */
  out: string

  /**
   * Working directory of the process.
   */
  cwd: string
}

/**
 * Runs one test process and collects the records it appends to its out file.
 * The process starts detached, as the leader of a process group, without stdin
 * (`startTestProcess`), or a spare process of the test file, started before,
 * runs instead. With a unit in the options, the process gets it as a line on
 * file descriptor 3, which is closed after it. Either way the start time is
 * now, so the deadline and the start-up of a spare count from the moment it got
 * its unit. The out file is read every 50 ms; when the time passes the deadline
 * the options compute from the records so far, the watchdog stops the whole
 * process group (`stopProcessGroup`). Once the process exits, what is left of
 * its group is stopped too, and the outcome tells whether anything was left or
 * the watchdog stopped it (`lingering`); the deadline no longer applies, and
 * the output gets 300 ms to close before it is dropped, so a process the tests
 * detached into a group of its own cannot hold the outcome back. While the
 * process runs, its group is in `groups`, which the session stops when it
 * closes. A line that is not JSON, as the last line of a stopped process, is
 * ignored.
 *
 * @param options - Binary, arguments, environment, out file, deadline, the unit
 *   for file descriptor 3 and a spare process, if any.
 * @returns Records, exit code or signal, start time, whether the watchdog
 *   stopped the process and whether its group outlived it.
 * @throws {Error} When the process cannot start.
 */
export function runTestProcess(
  options: TestProcessOptions,
): Promise<TestProcessOutcome> {
  let { onOutput } = options
  let records: NodeTestRecord[] = []
  let descriptor = openSync(options.out, 'r')
  let position = 0
  let rest = ''
  let spawned = Date.now()
  let watch: ProcessWatch = { last: spawned, records, spawned }
  let hung = false
  /**
   * Reads the records appended since the last read.
   */
  function read(): void {
    let { size } = fstatSync(descriptor)
    if (size <= position) {
      return
    }
    let buffer = Buffer.alloc(size - position)
    readSync(descriptor, buffer, 0, buffer.length, position)
    position = size
    let lines = (rest + buffer.toString('utf8')).split('\n')
    rest = lines.pop()!
    for (let line of lines) {
      try {
        records.push(JSON.parse(line) as NodeTestRecord)
      } catch {}
    }
    watch.last = Date.now()
  }
  let { unit } = options
  let child =
    options.spare ??
    startTestProcess({
      output: onOutput === undefined ? 'ignore' : 'pipe',
      pipe: unit !== undefined,
      groups: options.groups,
      node: options.node,
      args: options.args,
      cwd: options.cwd,
      env: options.env,
    })
  if (unit !== undefined && child.pid !== undefined) {
    let pipe = child.stdio[3] as Writable | null
    pipe?.on('error', () => {})
    pipe?.end(`${unit}\n`)
  }
  for (let stream of [child.stdout, child.stderr]) {
    stream?.setEncoding('utf8')
    stream?.on('data', (text: string) => {
      onOutput!(text)
    })
  }
  let exited = false
  let timer = setInterval(() => {
    read()
    if (!hung && !exited && Date.now() > options.deadline(watch)) {
      hung = true
      stopProcessGroup(child.pid!)
    }
  }, POLL_INTERVAL)
  let finished = false
  /**
   * Stops reading the out file once, after a last read.
   *
   * @returns Whether this call stopped it.
   */
  function finish(): boolean {
    if (finished) {
      return false
    }
    finished = true
    clearInterval(timer)
    read()
    closeSync(descriptor)
    return true
  }
  let lingering = false
  return new Promise((resolve, reject) => {
    /**
     * Resolves with the outcome once.
     *
     * @param code - Exit code, or null.
     * @param signal - Signal that ended the process, or null.
     */
    function settle(code: number | null, signal: NodeJS.Signals | null): void {
      if (finish()) {
        resolve({ lingering, spawned, records, signal, code, hung })
      }
    }
    child.on('error', error => {
      finish()
      reject(error)
    })
    child.on('exit', (code, signal) => {
      exited = true
      lingering = hung || isGroupAlive(child.pid!)
      stopProcessGroup(child.pid!)
      setTimeout(() => {
        for (let stream of child.stdio) {
          stream?.destroy()
        }
        settle(code, signal)
      }, CLOSE_GRACE)
    })
    child.on('close', settle)
  })
}
