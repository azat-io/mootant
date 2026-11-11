import { writeFile, realpath, mkdir } from 'node:fs/promises'
import path from 'node:path'

import type { WorkerFiles } from './types/worker-files'

import vmSetup from './worker/vm-setup.ts?inline-cjs'
import worker from './worker/worker.ts?inline-cjs'
import { RESULTS_MARK } from './results-mark'
import runner from './runner.ts?inline-cjs'

/**
 * Module that serves as Jest's reporter, which Jest creates with `new` and
 * whose methods it calls only when they exist.
 */
const NOOP = 'module.exports = function noop(results) { return results }\n'

/**
 * Results processor of the host, which Jest calls after global teardown: it
 * leaves a mark beside itself, synchronously, as the host exits at once, with
 * the snapshot files Jest found whose test file is gone. It writes the mark
 * under another name and then gives it its own, so the mark is there whole or
 * not at all, whatever stops the host.
 */
const RESULTS = `let { writeFileSync, renameSync } = require('node:fs')
let path = require('node:path')

module.exports = function results(results) {
  let mark = path.join(__dirname, ${JSON.stringify(RESULTS_MARK)})
  writeFileSync(mark + '.part', JSON.stringify(results.snapshot.filesRemovedList))
  renameSync(mark + '.part', mark)
  return results
}
`

/**
 * The test framework of the project copies: what the worker made at boot, so
 * that the tracker, the transformer and the worker share one module instance.
 */
const TEST_RUNNER =
  "module.exports = globalThis[Symbol.for('mootant.worker')].testRunner\n"

/**
 * The transformer of the project copies, for the same reason.
 */
const TRANSFORMER =
  "module.exports = globalThis[Symbol.for('mootant.worker')].transformer\n"

/**
 * Last of a project's `setupFiles` when its test environment or test runner is
 * its own: what the unit runs from here on, `environment.setup()` first, is the
 * test environment's, as `WorkerCalls.environment` says.
 */
const VM_SETUP_END =
  "Reflect.get(process, Symbol.for('mootant.channel')).enterEnvironment()\n"

/**
 * Writes the files of the Jest processes to the `jest` directory of the work
 * directory, by its real path, so that Jest and mootant read the same paths.
 * The runner gets an extension no project lists in `moduleFileExtensions`: Jest
 * hands the project's transformer only the files with those, and one that adds
 * an import or refuses a file outside the project would fail on it. Node loads
 * an unknown extension as CommonJS.
 *
 * @param workDirectory - Work directory of the run.
 * @returns Paths of the files main uses and their directory.
 */
export async function writeWorkerFiles(
  workDirectory: string,
): Promise<WorkerFiles> {
  let directory = path.join(await realpath(workDirectory), 'jest')
  await mkdir(directory, { recursive: true })
  let files = {
    results: path.join(directory, 'results.cjs'),
    runner: path.join(directory, 'runner.host'),
    worker: path.join(directory, 'worker.cjs'),
    noop: path.join(directory, 'noop.cjs'),
  }
  await writeFile(files.runner, runner)
  await writeFile(files.worker, worker)
  await writeFile(files.noop, NOOP)
  await writeFile(files.results, RESULTS)
  await writeFile(path.join(directory, 'vm-setup.cjs'), vmSetup)
  await writeFile(path.join(directory, 'vm-setup-end.cjs'), VM_SETUP_END)
  await writeFile(path.join(directory, 'test-runner.cjs'), TEST_RUNNER)
  await writeFile(path.join(directory, 'transformer.cjs'), TRANSFORMER)
  return { ...files, directory }
}
