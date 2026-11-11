import type { IsolatedFacts } from '../../types/adapter/isolated-result'
import type { TryLimits } from '../../types/adapter/try-limits'
import type { UnitOutcome } from './types/unit-outcome'

import { getTestId } from '../shared/get-test-id'
import { foldAttempts } from './fold-attempts'

/**
 * What a unit reads as when it left snapshots unchecked or unmatched: plain
 * Jest fails such a run with every test passing, and a dry run that left any
 * stops the run.
 */
const SNAPSHOTS_LEFT =
  'Snapshots went unchecked or failed, which fails the run.'

/**
 * Builds the facts of an isolated unit from what it left behind, or null when
 * it has none, which makes the core plan it once more and then read `Error`,
 * which no score counts, where a false kill would raise the score with no word.
 * An active mutant changes nothing before its site returned true, so a unit
 * with no `reached` record ran what the dry run ran, and anything but a clean
 * pass there is a flake or the machine. A failure in an earlier attempt of a
 * test that then passed is that clean pass, as in plain Jest. Other units with
 * no facts: an error of an earlier unit in any attempt; a failure of the host
 * realm or an error outside the tests on an attempt that is not clean, each of
 * which a clean attempt tells apart, since what a warm worker on any slot holds
 * can cause them; a worker that ran out of memory, as only mootant's limit does
 * that here, and a clean attempt has none; an exit that is not the unit's
 * second, as warm workers have causes of death of their own; a worker that said
 * its unit ended and lost its records, on any attempt, as that says nothing of
 * the mutant and a kill from it would raise the score with no word; and a
 * tracker that lost a record. A failed `beforeAll` fails the tests under it,
 * each with its own reach, as plain Jest counts it, so only `afterAll` speaks
 * for the whole unit.
 *
 * @param outcome - What the unit left behind.
 * @param input - The unit, its limits and how it ran.
 * @param input.retrying - Whether this unit had no facts before.
 * @param input.limits - Limits of the unit.
 * @param input.clean - Whether this was a clean attempt.
 * @param input.project - Name of the project, or an empty string.
 * @param input.mutant - Id of the mutant.
 * @param input.unit - Index of the unit in the plan.
 * @param input.root - Real path of the project root.
 * @param input.file - Absolute path of the test file.
 * @returns The facts of the unit, or null.
 */
export function buildIsolatedFacts(
  outcome: UnitOutcome,
  input: {
    retrying: boolean
    limits: TryLimits
    project: string
    clean: boolean
    mutant: string
    unit: number
    root: string
    file: string
  },
): IsolatedFacts | null {
  let { startup, records, signal, done, hung, code } = outcome
  let { project, mutant, root, file } = input
  let finish = records.find(record => record.kind === 'finish')
  let start = records.find(record => record.kind === 'start')
  let afterAll = records
    .filter(record => record.kind === 'hook')
    .filter(hook => hook.type === 'afterAll')
  let loaded = records.some(record => record.kind === 'load')
  let reached = records.some(record => record.kind === 'reached')
  let concurrent = records.some(record => record.kind === 'concurrent')
  let failing = finish?.outcome === 'failure' || finish?.outcome === 'empty'
  let failure = failing ? finish!.message : null
  let execError = finish?.execError ?? null
  let snapshotsLeft = (finish?.snapshots ?? 0) > 0
  let tests = foldAttempts(records)
  let hits = records.reduce(
    (highest, record) =>
      'hits' in record ? Math.max(highest, record.hits) : highest,
    0,
  )
  let recordsLost = signal === null && code === null
  let cleanPass =
    done &&
    !failing &&
    !snapshotsLeft &&
    execError === null &&
    afterAll.length === 0 &&
    hits <= input.limits.hitLimit &&
    tests.every(test => !test.failed)
  if (
    (!reached && !cleanPass) ||
    outcome.outOfMemory !== null ||
    finish?.realm === 'stale' ||
    records.some(
      record =>
        record.kind === 'stale' ||
        record.kind === 'tracker-error' ||
        (record.kind === 'try' && record.failed && record.realm === 'stale'),
    ) ||
    (!input.clean &&
      (execError !== null ||
        finish?.realm === 'host' ||
        tests.some(test => test.failed && test.realm === 'host'))) ||
    (!done && !hung && (recordsLost || !input.retrying))
  ) {
    return null
  }
  let incomplete: IsolatedFacts['incomplete'] = null
  if (!done) {
    incomplete = hung ? 'hang' : 'crash'
  }
  return {
    tests: tests.map(test => ({
      test: getTestId(root, file, {
        occurrence: test.occurrence,
        name: test.name,
        project,
      }),
      reached: concurrent ? reached : test.reached,
      duration: test.duration,
      timedOut: test.timedOut,
      message: test.message,
      failed: test.failed,
      hits: test.hits,
      skipped: false,
      covers: null,
      strays: [],
      mutant,
    })),
    hookError:
      (loaded ? failure : null) ??
      afterAll[0]?.message ??
      execError ??
      (snapshotsLeft ? SNAPSHOTS_LEFT : null),
    duration: start ? (finish ?? records.at(-1)!).time - start.time : 0,
    timedOut: afterAll.some(hook => hook.timedOut),
    loadError: loaded ? null : failure,
    unit: input.unit,
    strays: [],
    incomplete,
    startup,
    reached,
    hits,
  }
}
