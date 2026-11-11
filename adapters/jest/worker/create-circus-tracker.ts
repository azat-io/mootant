import type { CircusEvent } from '../types/circus-event'
import type { CircusState } from '../types/circus-state'
import type { JestRecord } from '../types/jest-record'
import type { VmSide } from '../types/vm-side'

import { compareCodeUnits } from '../../../core/compare-code-units'
import { readErrorFacts } from './read-error-facts'

/**
 * Circus's message for a test or hook that ran past its timeout, which circus
 * throws as a string, so a project's own error that holds some of these words
 * stays a failure.
 */
const TIMEOUT_MESSAGE = /^Exceeded timeout of \S+ ms for a (?:hook|test)\b/u

/**
 * What the tracker of one unit reads and where it reports.
 */
interface TrackerInput {
  /**
   * Realms to tell thrown values apart.
   */
  realms: { current: ErrorConstructor | null; dead: WeakSet<object> }

  /**
   * Writer of records, bound to the token of the unit.
   */
  write(record: JestRecord): void

  /**
   * Keeps Jest from writing the snapshot file of the test file.
   */
  freezeSnapshots(): void

  /**
   * Called when an error of a unit that ended shows up.
   */
  onStale(): void

  /**
   * Milliseconds of a clock no test can reach.
   */
  now(): number

  /**
   * What the vm's setup registered for the unit.
   */
  side: VmSide

  /**
   * Whether the unit is a dry run.
   */
  dry: boolean
}

/**
 * An attempt of a test that started and has not ended.
 */
interface OpenAttempt {
  /**
   * Ids of the sites evaluated in the attempt, or null when they go to the set
   * of the file or are not collected.
   */
  covers: Set<string> | null

  /**
   * Time the attempt started.
   */
  started: number

  /**
   * Site evaluations of the unit when the attempt started.
   */
  hits: number
}

/**
 * Creates the handler of circus's events for one unit, which turns them into
 * records. Every test of a unit runs, as in a plain run, since a later test may
 * clean what the next unit needs. It may throw on a broken input: the caller
 * catches, since circus's `dispatch` does not and a throw would fail the user's
 * file. `test_started` opens an attempt because `.only` and `-t` give
 * `test_start` for tests that never run. An `error` event other than a stale
 * one writes nothing: on Jest 30 a rejection handled later never fails the
 * file, so a record would be a false stray. Jest reads the errors of a test
 * when the run ends, and they may change after its `test_done`: Jest 30.5 can
 * give a test errors then, and an environment's own handler, which runs after
 * this one, may give or take them, as one that keeps failing tests in
 * quarantine does. So `run_finish`, which runs once that handler settled,
 * writes one more `try` for a test whose errors no longer match its last one,
 * either way, which folding reads as its last.
 *
 * @param input - What the tracker reads and where it reports.
 * @returns The handler.
 */
export function createCircusTracker(
  input: TrackerInput,
): (event: CircusEvent, state: CircusState) => void {
  let { freezeSnapshots, onStale, realms, write, side, dry, now } = input
  let { runtime } = side
  let fileCoverage = runtime.coverage as Set<string> | null
  let attempts = new WeakMap<object, OpenAttempt>()
  let ids = new WeakMap<object, { occurrence: number; name: string }>()
  let occurrences = new Map<string, number>()
  let written = new Map<{ errors: unknown[] }, boolean>()
  let concurrent = false

  /**
   * Gives every test of a block its id, in the order of definition, so an id
   * depends on neither the seed nor retries.
   *
   * @param block - Block to walk.
   * @param names - Names of the block and the blocks around it, without the
   *   root's.
   */
  function assignIds(
    block: CircusState['rootDescribeBlock'],
    names: string[],
  ): void {
    for (let child of block.children) {
      if (child.type === 'describeBlock') {
        assignIds(child, [...names, child.name])
      } else {
        let name = [...names, child.name].join(' > ')
        let occurrence = occurrences.get(name) ?? 0
        occurrences.set(name, occurrence + 1)
        ids.set(child, { occurrence, name })
      }
    }
  }

  /**
   * Writes a `try` record with what a test holds now.
   *
   * @param test - Test the record is about.
   * @param attempt - What the record says of the attempt.
   * @param attempt.covers - Ids of the sites of the attempt, or null.
   * @param attempt.duration - Milliseconds of the attempt.
   * @param attempt.hits - Site evaluations in the attempt.
   */
  function writeTry(
    test: { errors: unknown[] },
    attempt: { covers: string[] | null; duration: number; hits: number },
  ): void {
    let { occurrence, name } = ids.get(test)!
    let failed = test.errors.length > 0
    let facts = failed ? readErrorFacts(test.errors[0], realms) : null
    write({
      timedOut: facts !== null && TIMEOUT_MESSAGE.test(facts.message),
      message: facts?.message ?? null,
      realm: facts?.realm ?? null,
      reached: side.isReached(),
      kind: 'try',
      occurrence,
      failed,
      name,
      ...attempt,
    })
    if (facts?.realm === 'stale') {
      onStale()
    }
    written.set(test, failed)
  }

  return (event, state) => {
    switch (event.name) {
      case 'test_started': {
        let { occurrence, name } = ids.get(event.test)!
        let covers =
          fileCoverage === null || concurrent ? null : new Set<string>()
        attempts.set(event.test, { hits: runtime.hits, started: now(), covers })
        if (covers !== null) {
          runtime.coverage = covers
        }
        write({
          // Circus takes a timeout of 0 for none.
          timeout: (event.test.timeout ?? 0) || state.testTimeout,
          kind: 'open',
          occurrence,
          name,
        })
        break
      }
      case 'hook_failure': {
        let { type } = event.hook
        if (type === 'beforeAll' || type === 'afterAll') {
          let { message } = readErrorFacts(event.error, realms)
          write({
            timedOut: TIMEOUT_MESSAGE.test(message),
            kind: 'hook',
            message,
            type,
          })
        }
        break
      }
      case 'run_finish': {
        for (let [test, failed] of written) {
          let failing = test.errors.length > 0
          if (failing !== failed) {
            writeTry(test, { covers: null, duration: 0, hits: 0 })
          }
        }
        break
      }
      case 'hook_start': {
        if (dry) {
          write({
            timeout: (event.hook.timeout ?? 0) || state.testTimeout,
            kind: 'beat',
          })
        }
        break
      }
      case 'run_start': {
        assignIds(state.rootDescribeBlock, [])
        write({
          covers: [...(fileCoverage ?? [])].toSorted(compareCodeUnits),
          hits: runtime.hits,
          kind: 'load',
        })
        freezeSnapshots()
        break
      }
      case 'test_done': {
        let attempt = attempts.get(event.test)!
        writeTry(event.test, {
          covers:
            attempt.covers === null ?
              null
            : [...attempt.covers].toSorted(compareCodeUnits),
          duration: now() - attempt.started,
          hits: runtime.hits - attempt.hits,
        })
        runtime.coverage = fileCoverage
        attempts.delete(event.test)
        break
      }
      case 'add_test': {
        if (!concurrent && event.concurrent) {
          concurrent = true
          write({ kind: 'concurrent' })
        }
        break
      }
      case 'error': {
        let { message, realm } = readErrorFacts(event.error, realms)
        if (realm === 'stale') {
          write({ kind: 'stale', message })
          onStale()
        }
        break
      }
    }
  }
}
