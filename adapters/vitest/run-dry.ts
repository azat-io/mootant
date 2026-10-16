import type { TestSpecification } from 'vitest/node'

import type { DryRunRequest } from '../../types/adapter/dry-run-request'
import type { DryRunResult } from '../../types/adapter/dry-run-result'
import type { VitestHandle } from './types/vitest-session-state'
import type { VitestHeartbeat } from './types/vitest-worker'
import type { DryFile } from '../../types/adapter/dry-file'
import type { DryTest } from '../../types/adapter/dry-test'

import { compareCodeUnits } from '../../core/compare-code-units'
import { indexSwitchedFiles } from './index-switched-files'
import { resetRunDirectory } from './reset-run-directory'
import { runSpecifications } from './run-specifications'
import { getFileHash } from './worker/get-file-hash'
import { watchHeartbeats } from './watch-heartbeats'
import { stopHungWorker } from './stop-hung-worker'
import { watchUnitEnds } from './watch-unit-ends'
import { readOutFiles } from './read-out-files'

/**
 * Runs the selected test files without a mutant, each test twice in a row or,
 * without `repeat`, once, recording the mutant sites every try and every test
 * file evaluated. The switched files are read again from the context first;
 * files the core removed are invalidated, so their switched text is not served
 * from Vite's cache. Without instrumentation, every switched file is
 * invalidated before and after the run, so it is transformed again. A watchdog
 * stops a worker whose try runs past the request's test budget plus the test's
 * own timeout and the timeouts of its hooks, or whose work outside tries runs
 * past the file budget plus the timeouts of the file's suite hooks, and reports
 * it in `hung`. Each test file that ends is reported to the context's
 * `onUnitEnd`. Mutant sites the main process evaluated since the session
 * started, such as in a `globalSetup` file, are reported in `outside`.
 *
 * @param handle - Live Vitest instance of the session.
 * @param request - Related files, test files, repeats and whether to serve
 *   switched texts.
 * @returns Tests with their tries, test files, and the switched files served
 *   and found changed.
 */
export async function runDry(
  handle: VitestHandle,
  request: DryRunRequest,
): Promise<DryRunResult> {
  let { context, vitest, state } = handle
  let next = indexSwitchedFiles(context.files, state)
  if (state.files !== null) {
    for (let [key, entry] of state.files) {
      if (!next.has(key)) {
        vitest.invalidateFile(entry.file)
      }
    }
  }
  state.files = next
  state.served.clear()
  state.mismatched.clear()
  if (!request.instrumented) {
    state.instrumented = false
    invalidateSwitched(handle)
  }
  try {
    let specifications = await findSpecifications(handle, request)
    resetRunDirectory(context.workDirectory)
    let hung: VitestHeartbeat[] = []
    let watch = watchHeartbeats(context.workDirectory, async beat => {
      if (await stopHungWorker(beat.pid)) {
        hung.push(beat)
      }
    })
    let ends = watchUnitEnds(context.workDirectory, context.onUnitEnd)
    let error: string | null
    try {
      error = await runSpecifications(
        handle,
        { timeouts: request.timeouts, repeat: request.repeat, mode: 'dry' },
        specifications,
      )
    } finally {
      ends.stop()
      await watch.stop()
    }
    return {
      ...readDryResult(handle, specifications, error),
      hung: hung.map(beat => ({
        name: beat.name,
        test: beat.test,
        file: beat.file,
      })),
    }
  } finally {
    if (!request.instrumented) {
      state.instrumented = true
      invalidateSwitched(handle)
    }
  }
}

/**
 * Builds the result of a dry run from the out files. A test file without an end
 * record failed to load, with the run's error as its message. The time a file
 * spent outside tries after loading, such as in suite hooks, is its whole time
 * minus loading and its tries.
 *
 * @param handle - Live Vitest instance of the session.
 * @param specifications - Test files that ran.
 * @param error - First unhandled error of the run, or null.
 * @returns Result of the dry run.
 */
function readDryResult(
  handle: VitestHandle,
  specifications: readonly TestSpecification[],
  error: string | null,
): Omit<DryRunResult, 'hung'> {
  let { context, state } = handle
  let entries = new Map(
    specifications.map(({ moduleId, project }) => [
      getFileHash(moduleId, project.name),
      { project: project.name, file: moduleId },
    ]),
  )
  let reported = new Set<string>()
  let files: DryFile[] = []
  let tests: DryTest[] = []
  for (let [name, records] of readOutFiles(context.workDirectory)) {
    let hash = name.split('-', 1)[0]!
    let { project, file } = entries.get(hash)!
    let ended = false
    let tried = 0
    reported.add(hash)
    for (let record of records) {
      if (record.kind === 'test') {
        for (let facts of record.tries) {
          tried += facts.duration
        }
        tests.push({
          id: record.tries[0]!.test,
          tries: record.tries,
          line: record.line,
          name: record.name,
          project,
          file,
        })
      } else if (record.kind === 'end') {
        ended = true
        files.push({
          errors: [
            ...(record.loadError === null ? [] : [record.loadError]),
            ...(record.hookError === null ? [] : [record.hookError]),
            ...record.strays,
          ],
          hookDuration: Math.max(
            0,
            record.duration - record.loadDuration - tried,
          ),
          loadFailed: record.loadError !== null || record.hookError !== null,
          loadDuration: record.loadDuration,
          concurrent: record.concurrent,
          covers: record.covers,
          hits: record.hits,
          project,
          file,
        })
      }
    }
    if (!ended) {
      files.push(createFailedFile({ project, file }, error))
    }
  }
  for (let [hash, entry] of entries) {
    if (!reported.has(hash)) {
      files.push(createFailedFile(entry, error))
    }
  }
  return {
    mismatched: [...state.mismatched].toSorted(compareCodeUnits),
    outside: [...state.outside].toSorted(compareCodeUnits),
    served: [...state.served].toSorted(compareCodeUnits),
    tests: tests.toSorted(compareEntries),
    files: files.toSorted(compareEntries),
  }
}

/**
 * Finds the test files of a dry run: those that import a related file, in every
 * project that includes them; with selected files, only those.
 *
 * @param handle - Live Vitest instance of the session.
 * @param request - Related files and selected test files of the dry run.
 * @returns Specifications to run.
 */
async function findSpecifications(
  handle: VitestHandle,
  request: DryRunRequest,
): Promise<TestSpecification[]> {
  let { vitest } = handle
  let specifications: TestSpecification[]
  vitest.config.related = request.related
  try {
    specifications = await vitest.getRelevantTestSpecifications()
  } finally {
    vitest.config.related = undefined
  }
  specifications = specifications.filter(({ pool }) => pool !== 'typescript')
  if (request.files === null) {
    return specifications
  }
  let selected = new Set(
    request.files.map(({ project, file }) => getFileHash(file, project)),
  )
  return specifications.filter(({ moduleId, project }) =>
    selected.has(getFileHash(moduleId, project.name)),
  )
}

/**
 * Builds the entry of a test file that did not report its end.
 *
 * @param entry - Test file and its project.
 * @param entry.project - Name of the project, or an empty string.
 * @param entry.file - Absolute path of the test file.
 * @param error - First unhandled error of the run, or null.
 * @returns Test file that failed to load.
 */
function createFailedFile(
  entry: { project: string; file: string },
  error: string | null,
): DryFile {
  return {
    errors: [error ?? 'The test runner did not report this file.'],
    project: entry.project,
    concurrent: false,
    file: entry.file,
    loadFailed: true,
    hookDuration: 0,
    loadDuration: 0,
    covers: [],
    hits: 0,
  }
}

/**
 * Orders tests and test files by path, then by project.
 *
 * @param left - Entry expected first.
 * @param right - Entry expected second.
 * @param left.project - Name of its project.
 * @param left.file - Absolute path of its test file.
 * @param right.project - Name of its project.
 * @param right.file - Absolute path of its test file.
 * @returns A negative number when `left` sorts first, a positive number when
 *   `right` sorts first and 0 when both are equal.
 */
function compareEntries(
  left: { project: string; file: string },
  right: { project: string; file: string },
): number {
  return (
    compareCodeUnits(left.file, right.file) ||
    compareCodeUnits(left.project, right.project)
  )
}

/**
 * Drops every switched file from Vitest's module graphs, so the next run
 * transforms it again.
 *
 * @param handle - Live Vitest instance of the session.
 */
function invalidateSwitched(handle: VitestHandle): void {
  for (let entry of handle.context.files) {
    handle.vitest.invalidateFile(entry.file)
  }
}
