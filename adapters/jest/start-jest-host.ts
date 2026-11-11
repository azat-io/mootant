import { readFileSync, existsSync } from 'node:fs'
import { fork } from 'node:child_process'
import path from 'node:path'

import type { JestHostEnd, JestHost } from './types/jest-host'
import type { JestProject } from './types/jest-project'
import type { WorkerFiles } from './types/worker-files'
import type { JestReady } from './types/jest-ready'

import { stopProcessGroup } from '../shared/stop-process-group'
import { waitForJestExit } from './wait-for-jest-exit'
import { insertJestFlags } from './insert-jest-flags'
import { RESULTS_MARK } from './results-mark'

/**
 * Milliseconds Jest gets for global teardown before its group is stopped.
 */
const CLOSE_LIMIT = 60_000

/**
 * Most code units of the output of a parked host that an error message holds;
 * until the host is parked, the whole output counts.
 */
const OUTPUT_LIMIT = 4000

/**
 * The line `--forceExit` prints, which is mootant's doing and not the
 * project's.
 */
const FORCE_EXIT_LINE = /^.*Force exiting Jest.*(?:\n|$)/gmu

/**
 * Starts the host: the project's Jest with mootant's runner, a process group of
 * its own and an IPC channel. Jest reads its configuration, runs global setup
 * and parks in the runner, which sends `ready`. Its output goes to `onOutput`
 * chunk by chunk. When the process ends, what is left of its group is stopped.
 * With `--passWithNoTests` a project without test files ends with code 0 before
 * the runner, whether or not the project asks for it, so that it gets one
 * sentence, as it does with the other runners.
 *
 * @param input - How to run Jest.
 * @param input.onOutput - Receives the output of the host.
 * @param input.projects - Kept projects.
 * @param input.nodeFlags - Node flags of the command.
 * @param input.env - Environment of the host.
 * @param input.args - Jest's arguments that stayed after the filter.
 * @param input.base - Flags mootant adds to them.
 * @param input.files - Files mootant wrote for the host.
 * @param input.root - Project root, the working directory.
 * @param input.bin - Path of the file Jest's binary runs.
 * @returns The running host.
 * @throws {Error} When the host cannot start, exits before `ready`, or has no
 *   test file in a kept project; no process is left then.
 */
export function startJestHost(input: {
  projects: readonly JestProject[]
  onOutput(text: string): void
  args: readonly string[]
  base: readonly string[]
  env: NodeJS.ProcessEnv
  nodeFlags: string[]
  files: WorkerFiles
  root: string
  bin: string
}): Promise<JestHost> {
  let child = fork(
    input.bin,
    insertJestFlags(input.args, [
      ...input.base,
      `--runner=${input.files.runner}`,
      `--reporters=${input.files.noop}`,
      `--testResultsProcessor=${input.files.results}`,
      '--passWithNoTests',
      '--forceExit',
    ]),
    {
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      execArgv: input.nodeFlags,
      serialization: 'json',
      cwd: input.root,
      env: input.env,
      detached: true,
    },
  )
  let output = ''
  let limit = Number.POSITIVE_INFINITY
  /**
   * Remembers the output and hands it on.
   *
   * @param chunk - What the host wrote.
   */
  function receive(chunk: string): void {
    let text = chunk.replaceAll(FORCE_EXIT_LINE, '')
    if (text !== '') {
      output = (output + text).slice(-limit)
      input.onOutput(text)
    }
  }
  for (let stream of [child.stdout, child.stderr]) {
    stream?.setEncoding('utf8')
    stream?.on('data', receive)
  }
  let exited = waitForJestExit(child)
  let closing: Promise<JestHostEnd> | null = null
  let early = false
  /**
   * Asks the host to end and waits for it, stopping its group past the limit.
   *
   * @returns One promise, which never rejects, of how the host ended.
   */
  function close(): Promise<JestHostEnd> {
    closing ??= (async () => {
      if (child.connected) {
        child.send({ type: 'close' }, () => {})
      }
      let stopped = false
      let timer = setTimeout(() => {
        stopped = true
        stopProcessGroup(child.pid!)
      }, CLOSE_LIMIT)
      let { code, how } = await exited
      clearTimeout(timer)
      let mark = path.join(input.files.directory, RESULTS_MARK)
      let finished = existsSync(mark)
      let obsolete =
        finished ? (JSON.parse(readFileSync(mark, 'utf8')) as string[]) : []
      return { obsolete, finished, stopped, output, early, code, how }
    })()
    return closing
  }
  let empty = `Jest found no test files in ${input.root}; add a test or fix the Jest configuration.`
  let died = new Promise<Error>(resolve => {
    void exited.then(({ how }) => {
      if (closing === null) {
        early = true
        resolve(
          new Error(
            `The Jest process that ran global setup ${how}, and what global setup started went with it; its last output:\n${output}`,
          ),
        )
      }
    })
  })
  return new Promise((resolve, reject) => {
    child.on('error', error => {
      reject(
        new Error(
          `Jest could not start in ${input.root}: ${error.message}; check that the directory exists.`,
        ),
      )
    })
    void exited.then(({ code, how }) => {
      if (closing === null) {
        reject(
          new Error(
            code === 0 ? empty : (
              `Jest ${how} before it reached its tests:\n${output}`
            ),
          ),
        )
      }
    })
    child.on('message', message => {
      let ready = message as JestReady | null
      if (ready?.type === 'ready' && Array.isArray(ready.tests)) {
        limit = OUTPUT_LIMIT
        output = output.slice(-limit)
        let ids = new Set(input.projects.map(({ config }) => config.id))
        let tests = ready.tests.filter(test => ids.has(test.project))
        if (tests.length === 0) {
          void close().then(() => {
            reject(new Error(empty))
          })
        } else {
          resolve({
            testCount: ready.tests.length,
            ready: { ...ready, tests },
            close,
            died,
          })
        }
      }
    })
  })
}
