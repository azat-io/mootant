import type { DryFile } from '../../types/adapter/dry-file'
import type { DryTest } from '../../types/adapter/dry-test'
import type { UnitOutcome } from './types/unit-outcome'

import { collectJestDependencies } from './collect-jest-dependencies'
import { describeExit } from '../shared/describe-exit'
import { getTestId } from '../shared/get-test-id'
import { foldAttempts } from './fold-attempts'

/**
 * What a worker that said its unit ended and left no `finish` record reads as:
 * a left `mock-fs` or a full disk lost its records.
 */
const RECORDS_LOST = 'The test process could not write what its test file did.'

/**
 * What a test file reads as when its snapshots alone fail it.
 */
const SNAPSHOTS_LEFT =
  'Snapshots are obsolete or failed while every test passed, which fails a plain run of Jest too.'

/**
 * What the dry run of one test file reported.
 */
interface DryFileReport {
  /**
   * Test that ran when the watchdog stopped the worker, or null.
   */
  hung: { name: string | null; test: string | null } | null

  /**
   * Tests of the file with their one try each, by their first attempts.
   */
  tests: DryTest[]

  /**
   * The test file.
   */
  entry: DryFile
}

/**
 * Builds the dry-run report of a test file from the records of its unit. The
 * ids of tests hold the project, or the core keys the tests of two projects as
 * one. Per-test coverage is wrong in a file with concurrent tests, as their
 * bodies interleave, so the file holds what ran while it loaded and every try
 * what ran after that. Covers stay on a file that failed to load, as they are
 * what the core can blame when it cannot tell what the file depends on, instead
 * of every switched file. A tracker error fails the file, as the `try` it lost
 * would leave a test out with no word. A failed `beforeAll` fails the tests
 * under it, as in plain Jest, which forgives it when they pass on retry or are
 * all `test.todo`, so the file says nothing of it. A snapshot no test checked,
 * such as one of a deleted test, or one that failed in a test that still
 * passed, fails a plain run of Jest with every test passing, so then it fails
 * the file; next to a failed test, that test tells it. What the file depended
 * on comes from the `finish` record (`collectJestDependencies`), and so do the
 * variables the code read and the files it read and changed itself, whose
 * contents the cache then compares, as their times say nothing of edits.
 *
 * @param outcome - What the unit left behind.
 * @param input - Test file, project and root.
 * @param input.project - Name of the project, or an empty string.
 * @param input.root - Real path of the project root.
 * @param input.file - Absolute path of the test file.
 * @returns The test file, its tests and its hang.
 */
export function buildDryFile(
  outcome: UnitOutcome,
  input: { project: string; root: string; file: string },
): DryFileReport {
  let { records } = outcome
  let { project, root, file } = input
  let finish = records.find(record => record.kind === 'finish')
  let start = records.find(record => record.kind === 'start')
  let load = records.find(record => record.kind === 'load')
  let concurrent = records.some(record => record.kind === 'concurrent')
  let folded = foldAttempts(records)
  let tryDuration = folded.reduce((sum, test) => sum + test.duration, 0)
  let tryHits = folded.reduce((sum, test) => sum + test.hits, 0)
  let loadCovers = new Set(load?.covers)
  let errors = [
    finish?.message,
    ...records.flatMap(record =>
      (
        (record.kind === 'hook' && record.type === 'afterAll') ||
        record.kind === 'tracker-error'
      ) ?
        [record.message]
      : [],
    ),
    finish?.execError,
    (
      finish !== undefined &&
      finish.snapshots > 0 &&
      folded.every(test => !test.failed)
    ) ?
      SNAPSHOTS_LEFT
    : null,
    outcome.done ? null : describeEnd(outcome),
  ].filter(error => typeof error === 'string')

  /**
   * Gives the id of a test of the file.
   *
   * @param test - Full name and occurrence of the test.
   * @param test.occurrence - Earlier tests of the file with the same name.
   * @param test.name - Full name of the test.
   * @returns Its id.
   */
  function getId(test: { occurrence: number; name: string }): string {
    let { occurrence, name } = test
    return getTestId(root, file, { occurrence, project, name })
  }

  let running = findRunningTest(outcome)
  return {
    tests: folded.map(test => ({
      tries: [
        {
          covers:
            concurrent ?
              (finish?.covers ?? []).filter(id => !loadCovers.has(id))
            : test.covers,
          duration: test.duration,
          timedOut: test.timedOut,
          message: test.message,
          failed: test.failed,
          test: getId(test),
          hits: test.hits,
          skipped: false,
          reached: false,
          mutant: null,
          strays: [],
        },
      ],
      line: finish?.lines[test.name] ?? null,
      name: test.name,
      id: getId(test),
      project,
      file,
    })),
    entry: {
      ...(finish !== undefined && {
        environment: finish.variables,
        modified: finish.writes,
      }),
      hookDuration:
        finish && load ? Math.max(0, finish.time - load.time - tryDuration) : 0,
      covers: (concurrent ? load?.covers : undefined) ?? finish?.covers ?? [],
      loadDuration: start ? (load ?? records.at(-1)!).time - start.time : 0,
      hits: finish ? Math.max(0, finish.hits - tryHits) : 0,
      dependencies: collectJestDependencies(records, file),
      loadFailed: errors.length > 0,
      concurrent,
      project,
      errors,
      file,
    },
    hung:
      outcome.hung ?
        {
          test: running === undefined ? null : getId(running),
          name: running?.name ?? null,
        }
      : null,
  }
}

/**
 * Finds the test that ran last in a unit: the last `open` record with no `try`
 * after it for the same test.
 *
 * @param outcome - What the unit left behind.
 * @returns Full name and occurrence of the test, if a test ran.
 */
function findRunningTest(
  outcome: UnitOutcome,
): { occurrence: number; name: string } | undefined {
  let running: { occurrence: number; name: string }[] = []
  for (let record of outcome.records) {
    if (record.kind === 'open') {
      running.push(record)
    } else if (record.kind === 'try') {
      running = running.filter(
        ({ occurrence, name }) =>
          name !== record.name || occurrence !== record.occurrence,
      )
    }
  }
  return running.at(-1)
}

/**
 * Describes how a worker ended a unit that left no `finish` record.
 *
 * @param outcome - What the unit left behind.
 * @returns A sentence.
 */
function describeEnd(outcome: UnitOutcome): string {
  return outcome.code === null && outcome.signal === null ?
      RECORDS_LOST
    : describeExit(outcome)
}
