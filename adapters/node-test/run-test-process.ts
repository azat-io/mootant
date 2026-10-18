import type { ChildProcess } from 'node:child_process'

import { closeSync, fstatSync, openSync, readSync } from 'node:fs'
import { spawn } from 'node:child_process'

import type { TestProcessOutcome } from './types/test-process-outcome'
import type { NodeTestRecord } from './types/node-test-record'
import type { ProcessWatch } from './types/process-watch'

import { trackProcessGroup } from './track-process-group'
import { stopProcessGroup } from './stop-process-group'

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
   * Arguments after the Node binary.
   */
  args: string[]

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
 * The process starts detached, as the leader of a process group, without stdin.
 * The out file is read every 50 ms; when the time passes the deadline the
 * options compute from the records so far, the watchdog stops the whole process
 * group (`stopProcessGroup`). Once the process exits, what is left of its group
 * is stopped too, the deadline no longer applies, and the output gets 300 ms to
 * close before it is dropped, so a process the tests detached into a group of
 * its own cannot hold the outcome back. While the process runs, it is stopped
 * when mootant exits or gets SIGINT or SIGTERM (`trackProcessGroup`). A line
 * that is not JSON, as the last line of a stopped process, is ignored.
 *
 * @param options - Binary, arguments, environment, out file and deadline.
 * @returns Records, exit code or signal, start time and whether the watchdog
 *   stopped the process.
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
  let output: 'ignore' | 'pipe' = onOutput === undefined ? 'ignore' : 'pipe'
  let child: ChildProcess = spawn(options.node, options.args, {
    stdio: ['ignore', output, output],
    windowsHide: true,
    cwd: options.cwd,
    env: options.env,
    detached: true,
  })
  for (let stream of [child.stdout, child.stderr]) {
    stream?.setEncoding('utf8')
    stream?.on('data', (text: string) => {
      onOutput!(text)
    })
  }
  let untrack =
    child.pid === undefined ? () => {} : trackProcessGroup(child.pid)
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
    untrack()
    read()
    closeSync(descriptor)
    return true
  }
  return new Promise((resolve, reject) => {
    child.on('error', error => {
      finish()
      reject(error)
    })
    child.on('exit', (code, signal) => {
      exited = true
      stopProcessGroup(child.pid!)
      setTimeout(() => {
        child.stdout?.destroy()
        child.stderr?.destroy()
        if (finish()) {
          resolve({ spawned, records, signal, code, hung })
        }
      }, CLOSE_GRACE)
    })
    child.on('close', (code, signal) => {
      if (finish()) {
        resolve({ spawned, records, signal, code, hung })
      }
    })
  })
}
