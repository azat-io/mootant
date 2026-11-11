import { fork } from 'node:child_process'

import type { JestWorker } from './types/jest-worker'

import { stopProcessGroup } from '../shared/stop-process-group'
import { waitForJestExit } from './wait-for-jest-exit'

/**
 * Milliseconds a worker gets to boot before its group is stopped.
 */
const READY_LIMIT = 60_000

/**
 * What V8 writes to standard error as a process runs out of memory.
 */
const OUT_OF_MEMORY = 'heap out of memory'

/**
 * Forks one worker with the host's environment and working directory, as the
 * leader of a process group of its own. Each chunk of its output goes to
 * `onOutput` with the test file of the unit last sent. The whole of standard
 * error is searched for the words of V8, across chunks, since 11 KB of native
 * stack follow them. The heap flag is also in `MOOTANT_HEAP_FLAG`, so that the
 * worker can keep it from what a test starts.
 *
 * @param input - How to fork it.
 * @param input.onOutput - Receives what the worker writes, with the test file
 *   of its last unit, or null before the first.
 * @param input.env - Environment of the host.
 * @param input.heapCap - Heap limit in megabytes, or null for none from
 *   mootant.
 * @param input.nodeFlags - Node flags of the test command.
 * @param input.session - Absolute path of `session.json`.
 * @param input.file - Absolute path of the entry of a worker process.
 * @param input.slot - Number of the slot, from 1.
 * @param input.cwd - Working directory of the host.
 * @returns The worker, which is booting.
 */
export function startWorker(input: {
  onOutput(text: string, file: string | null): void
  env: Record<string, string>
  heapCap: number | null
  nodeFlags: string[]
  session: string
  file: string
  slot: number
  cwd: string
}): JestWorker {
  let heapFlag =
    input.heapCap === null ? null : `--max-old-space-size=${input.heapCap}`
  let child = fork(input.file, [], {
    env: {
      ...input.env,
      ...(heapFlag !== null && { MOOTANT_HEAP_FLAG: heapFlag }),
      MOOTANT_SLOT: String(input.slot),
      MOOTANT_SESSION: input.session,
    },
    execArgv:
      heapFlag === null ? input.nodeFlags : [...input.nodeFlags, heapFlag],
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    serialization: 'json',
    cwd: input.cwd,
    detached: true,
  })
  let scanned = ''
  let phraseSeen = false
  let worker: JestWorker = {
    ready: new Promise((resolve, reject) => {
      let timer = setTimeout(() => {
        stopProcessGroup(child.pid!)
        resolve(false)
      }, READY_LIMIT)
      child.on('message', (message: { type?: unknown } | null) => {
        if (message?.type === 'ready') {
          clearTimeout(timer)
          resolve(true)
        }
      })
      child.once('exit', () => {
        clearTimeout(timer)
        resolve(false)
      })
      child.on('error', error => {
        clearTimeout(timer)
        reject(new Error(`A Jest worker could not start: ${error.message}.`))
      })
    }),
    alive: () =>
      child.pid !== undefined &&
      child.exitCode === null &&
      child.signalCode === null,
    outOfMemory: () =>
      phraseSeen && (child.signalCode === 'SIGABRT' || child.exitCode === 134),
    exited: waitForJestExit(child),
    heapCap: input.heapCap,
    file: null,
    child,
  }
  for (let stream of [child.stdout, child.stderr]) {
    stream?.setEncoding('utf8')
    stream?.on('data', (text: string) => {
      input.onOutput(text, worker.file)
    })
  }
  child.stderr?.on('data', (text: string) => {
    let joined = scanned + text
    phraseSeen ||= joined.includes(OUT_OF_MEMORY)
    scanned = joined.slice(-OUT_OF_MEMORY.length)
  })
  return worker
}
