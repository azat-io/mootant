import type { MutantRuntime } from '../../../types/adapter/mutant-runtime'
import type { NodeTestRecord } from '../types/node-test-record'
import type { NodeTestUnit } from '../types/node-test-unit'
import type { TryTracker } from '../types/try-tracker'
import type { TryContext } from '../types/try-context'

import { getErrorMessage } from '../../shared/get-error-message'
import { createBailError } from './create-bail-error'

/**
 * A try that started and is not recorded yet.
 */
interface OpenTry {
  /**
   * What the try evaluated by the end of its test's hooks, or null while they
   * run.
   */
  ended: { duration: number; reached: boolean; hits: number } | null

  /**
   * Ids of the sites evaluated while the try ran, or null without coverage.
   */
  covers: Set<string> | null

  /**
   * Context of the test, read when the try is final.
   */
  context: TryContext

  /**
   * Earlier tries with the same full name.
   */
  occurrence: number

  /**
   * Time the try started, from the process's clock.
   */
  started: number

  /**
   * Full name of the test.
   */
  name: string

  /**
   * Site evaluations of the process when the try started.
   */
  hits: number

  /**
   * Number of the try in the process.
   */
  seq: number
}

/**
 * What the tracker observes and where it reports.
 */
interface TrackerOptions {
  /**
   * What the process runs.
   */
  unit: Pick<NodeTestUnit, 'expected' | 'hitLimit' | 'mutant' | 'mode' | 'bail'>

  /**
   * Writer of records.
   */
  write(record: NodeTestRecord): void

  /**
   * Mutant runtime of the process; the tracker sets it up for the unit.
   */
  runtime: MutantRuntime

  /**
   * Time the preload started, from the same clock.
   */
  started: number

  /**
   * Milliseconds from the process's clock, never moved by fake timers.
   */
  now(): number
}

/**
 * Creates the tracker of the tries of a test process and sets the runtime up:
 * in a dry run the original code runs and coverage goes to the running tries,
 * or outside tries when none runs; in an isolated unit the mutant is active
 * from the start, with the hit limit for the whole process.
 *
 * A try is one run of a test that node:test's root `beforeEach` sees, from that
 * hook to the end of the test's hooks, which a `t.after()` hook registered in
 * the root `beforeEach` marks: node:test runs it after every `afterEach` hook,
 * also those registered at the root after mootant's, and also when a test
 * skipped itself or an `afterEach` hook failed, where later `afterEach` hooks
 * do not run. A test that starts while a running try's name prefixes its own
 * full name is a subtest, part of that try. Whether a try passed is read only
 * when it is final: when the next try starts, or at the exit, since node:test
 * fails a test for failed subtests only after its hooks. Tries that overlap,
 * such as concurrent tests, each get the sites evaluated while they run.
 *
 * In an isolated unit with bail, a try that failed after the mutant was reached
 * makes the root `beforeEach` throw for every later test, so node:test skips
 * their bodies, and leaves a bail record; expected failures
 * (`NodeTestUnit.expected`) count as passed and never stop the unit.
 *
 * A failed todo test never fails the file, but no hook tells it is todo:
 * mootant's reporter passes the error of every failed todo test (`todo`), the
 * same object as the test's `context.error`, which node:test reports only some
 * time after the test, on recent versions of Node even after later tests ran. A
 * try whose error the reporter passed before the try is final counts as passed
 * and never stops the unit; one it passes later gets a `todo-try` record, which
 * the main process reads instead. An uncaught error that node:test gave to a
 * todo test, which then failed with it as the cause of its error, gets a
 * `todo-error` record, since it never fails the run either.
 *
 * Uncaught errors belong to the tries running when they come; outside tries, an
 * error before the test file finished evaluating is a load error. Records are
 * written as things happen; the end record only at the exit.
 *
 * @param options - Runtime, unit, writer and clock.
 * @returns Tracker that the root `beforeEach`, the error listeners, the marker
 *   of the test file and the exit handler call.
 */
export function createTryTracker(options: TrackerOptions): TryTracker {
  let { runtime, started, write, unit, now } = options
  let dry = unit.mode === 'dry'
  let outside = dry ? new Set<string>() : null
  let expected = new Set(
    unit.expected.map(entry => JSON.stringify([entry.name, entry.occurrence])),
  )
  let occurrences = new Map<string, number>()
  let running: OpenTry[] = []
  let ended: OpenTry[] = []
  let loadDuration: number | null = null
  let hookDuration = 0
  let idleSince = started
  let outsideHits = 0
  let outsideFrom = 0
  let concurrent = false
  let failures: { error: unknown; seq: number }[] = []
  let todoErrors = new Set<unknown>()
  let errors: unknown[] = []
  let loaded = false
  let bailed = false
  let seq = 0

  runtime.active = unit.mutant
  runtime.hitLimit = unit.hitLimit ?? Infinity
  runtime.reached = false
  runtime.hits = 0
  runtime.coverage =
    outside === null ? null : (
      {
        add(id) {
          if (running.length === 0) {
            outside.add(id)
          }
          for (let entry of running) {
            entry.covers!.add(id)
          }
        },
      }
    )

  /**
   * Records a try once it is final.
   *
   * @param entry - The try.
   */
  function finish(entry: OpenTry): void {
    let unfinished = entry.ended === null
    let facts = entry.ended ?? {
      duration: now() - entry.started,
      hits: runtime.hits - entry.hits,
      reached: runtime.reached,
    }
    let { occurrence, context, name } = entry
    let failed = !unfinished && !context.passed
    let error: unknown = failed ? context.error : null
    let timedOut = readErrorField(error, 'failureType') === 'testTimeoutFailure'
    let cause: unknown = readErrorField(error, 'cause') ?? error
    if (
      expected.has(JSON.stringify([name, occurrence])) ||
      todoErrors.has(context.error)
    ) {
      failed = false
    }
    write({
      covers: entry.covers === null ? null : [...entry.covers].toSorted(),
      message: failed ? getErrorMessage(cause) : null,
      timedOut: failed && timedOut,
      duration: facts.duration,
      reached: facts.reached,
      hits: facts.hits,
      seq: entry.seq,
      kind: 'try',
      unfinished,
      occurrence,
      failed,
      name,
    })
    if (failed) {
      failures.push({ error: context.error, seq: entry.seq })
    }
    if (failed && unit.bail && facts.reached) {
      bailed = true
      write({ seq: entry.seq, kind: 'bail' })
    }
  }

  /**
   * Ends a try at the end of its test's hooks.
   *
   * @param entry - The try.
   */
  function close(entry: OpenTry): void {
    running = running.filter(other => other !== entry)
    entry.ended = {
      hits: runtime.hits - entry.hits,
      duration: now() - entry.started,
      reached: runtime.reached,
    }
    ended.push(entry)
    if (running.length === 0) {
      idleSince = now()
      outsideFrom = runtime.hits
    }
    write({ seq: entry.seq, kind: 'close' })
  }

  return {
    open(context) {
      // `fullName` exists from Node 20.16 and 22.3 on, which the version check
      // guarantees.
      let name = context.fullName
      if (running.some(entry => name.startsWith(`${entry.name} > `))) {
        return
      }
      for (let entry of ended) {
        finish(entry)
      }
      ended = []
      if (bailed) {
        throw createBailError()
      }
      let time = now()
      if (running.length > 0) {
        concurrent = true
      } else {
        outsideHits += runtime.hits - outsideFrom
        if (loadDuration === null) {
          loadDuration = time - started
        } else {
          hookDuration += time - idleSince
        }
      }
      let occurrence = occurrences.get(name) ?? 0
      occurrences.set(name, occurrence + 1)
      let entry: OpenTry = {
        covers: dry ? new Set() : null,
        hits: runtime.hits,
        started: time,
        ended: null,
        seq: seq++,
        occurrence,
        context,
        name,
      }
      running.push(entry)
      write({ seq: entry.seq, kind: 'open', occurrence, name })
      context.after(() => {
        close(entry)
      })
    },
    exit(code, inputs) {
      let time = now()
      for (let entry of [...ended, ...running]) {
        finish(entry)
      }
      if (running.length === 0) {
        outsideHits += runtime.hits - outsideFrom
        if (loadDuration !== null) {
          hookDuration += time - idleSince
        }
      }
      write({
        ...inputs,
        covers: outside === null ? null : [...outside].toSorted(),
        loadDuration: loadDuration ?? time - started,
        duration: time - started,
        reached: runtime.reached,
        total: runtime.hits,
        hits: outsideHits,
        hookDuration,
        kind: 'end',
        concurrent,
        code,
      })
    },
    todo(error) {
      if (error === undefined) {
        return
      }
      todoErrors.add(error)
      let cause = readErrorField(error, 'cause')
      for (let [index, other] of errors.entries()) {
        if (cause !== undefined && other === cause) {
          write({ kind: 'todo-error', error: index })
        }
      }
      for (let failure of failures) {
        if (failure.error === error) {
          write({ seq: failure.seq, kind: 'todo-try' })
        }
      }
      failures = failures.filter(failure => failure.error !== error)
    },
    error(error) {
      errors.push(error)
      let tries = running.map(entry => entry.seq)
      write({
        load: tries.length === 0 && !loaded,
        message: getErrorMessage(error),
        hits: runtime.hits,
        kind: 'error',
        tries,
      })
    },
    loaded() {
      if (!loaded) {
        loaded = true
        write({ kind: 'loaded' })
      }
    },
  }
}

/**
 * Reads a field of what node:test reported as the error of a test, which may be
 * any thrown value.
 *
 * @param error - The error, or null for a test that did not fail.
 * @param key - Name of the field, such as `cause`.
 * @returns Value of the field, or undefined when the error is no object.
 */
function readErrorField(error: unknown, key: string): unknown {
  return typeof error === 'object' && error !== null ?
      Reflect.get(error, key)
    : undefined
}
