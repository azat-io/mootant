import path from 'node:path'

import type { UnitOutcome } from './types/unit-outcome'
import type { WorkerSlot } from './types/worker-slot'
import type { JestHandle } from './types/jest-handle'

import { getTestFileKey } from '../../core/run/get-test-file-key'
import { getDisplayPath } from '../../core/run/get-display-path'
import { keepLateTransforms } from './keep-late-transforms'
import { getDryDeadline } from './get-dry-deadline'
import { runInPool } from '../shared/run-in-pool'
import { buildDryFile } from './build-dry-file'
import { runOnWorker } from './run-on-worker'

/**
 * What an attempt of a test file gave.
 */
interface RepeatAttempt {
  /**
   * What failed it, or null when it passed.
   */
  failure: string | null

  /**
   * Jest's text of the file, in the order its reporters show it: what tests
   * printed to a console that kept it, then the failure.
   */
  output: string[]
}

/**
 * A test file in one project.
 */
interface RepeatTarget {
  /**
   * Name of the project, or an empty string.
   */
  project: string

  /**
   * Absolute path of the test file.
   */
  file: string
}

/**
 * Runs the test files of a chain with no mutant, on the slot of the chain, once
 * its units ended. Every unit of a session shares one global setup and what is
 * on disk, while each plain run gets a new setup, so what such a unit says may
 * not be of its mutant. A first attempt is warm, so that it meets the worker
 * the units ran on, or its replacement, and most files stop there. One that
 * fails gets a clean attempt on this slot, which keeps its `JEST_WORKER_ID`. A
 * file that fails that too stops the run, while one that passes it failed on
 * what a warm worker held or on a flake. Nothing a dry run keeps changes, but
 * what the transformers of an attempt read that no dry run's did joins
 * `state.lateTransforms`, as in a unit: a file whose path varies may load a
 * module its dry run did not, and later units on the worker get it from
 * memory.
 *
 * @param handle - Live session, which had a dry run.
 * @param slot - Slot the chain holds.
 * @param targets - The test files, each once per project.
 * @returns Keys by `getTestFileKey` of the files that failed their first
 *   attempt and passed a clean one.
 * @throws {Error} Naming the file that fails its clean attempt too, with what
 *   Jest's reporters show of that attempt gone to the output first.
 */
export async function checkRepeatable(
  handle: JestHandle,
  slot: WorkerSlot,
  targets: readonly RepeatTarget[],
): Promise<Set<string>> {
  let warm = await runInPool(
    targets.map(target => ({
      run: () => checkTarget(handle, slot, target),
      key: getTestFileKey(target),
    })),
    1,
  )
  return new Set(
    targets
      .filter((_, index) => warm[index])
      .map(target => getTestFileKey(target)),
  )
}

/**
 * Runs one attempt of a test file, with a new out file, the plan of the session
 * and the budgets of its last dry run, and the console of its project, as the
 * first attempt of a dry run has. A failing attempt discards its worker, and
 * one that ran out of memory raises the cap of later workers.
 *
 * @param handle - Live session.
 * @param slot - Slot the chain holds.
 * @param input - What to run.
 * @param input.target - The test file.
 * @param input.clean - Whether this is a clean attempt.
 * @returns What the attempt gave.
 */
async function runAttempt(
  handle: JestHandle,
  slot: WorkerSlot,
  input: { target: RepeatTarget; clean: boolean },
): Promise<RepeatAttempt> {
  let { directory, consoles, projects, state, heap, pool } = handle
  let { target, clean } = input
  let { config } = projects.find(({ name }) => name === target.project)!
  state.units += 1
  let outcome = await runOnWorker(pool, slot, {
    unit: {
      out: path.join(directory, 'out', `${state.units}.jsonl`),
      console: consoles.get(target.project)!,
      project: config.id,
      file: target.file,
      plan: state.plan,
      mutant: null,
    },
    deadline: (records, sent) => getDryDeadline(records, sent, state.timeouts!),
    discardWhen: ended => readFailure(ended, handle, target) !== null,
    clean,
  })
  if (outcome.outOfMemory !== null) {
    heap.raise(outcome.outOfMemory)
  }
  keepLateTransforms(state, outcome.records)
  let finish = outcome.records.find(record => record.kind === 'finish')
  return {
    output: [finish?.consoleOutput, finish?.failureMessage].filter(
      text => typeof text === 'string',
    ),
    failure: readFailure(outcome, handle, target),
  }
}

/**
 * Checks one test file.
 *
 * @param handle - Live session.
 * @param slot - Slot the chain holds.
 * @param target - The test file.
 * @returns Whether it failed its first attempt and passed a clean one.
 * @throws {Error} When it fails its clean attempt too.
 */
async function checkTarget(
  handle: JestHandle,
  slot: WorkerSlot,
  target: RepeatTarget,
): Promise<boolean> {
  let { freshWorkers, context, root } = handle
  let first = await runAttempt(handle, slot, { clean: freshWorkers, target })
  if (first.failure === null) {
    return false
  }
  let last = await runAttempt(handle, slot, { clean: true, target })
  if (last.failure === null) {
    return true
  }
  for (let text of last.output) {
    context.onOutput?.(text, target.file)
  }
  throw new Error(
    `${getDisplayPath(target.file, root)} fails when it runs again without mutants: ${last.failure.replace(/\.$/u, '')}; mootant runs a test file many times in one session, against one global setup, so its tests must not be flaky and must reset what they depend on before they run. A mutant may also have changed or deleted files its tests depend on, such as build output; restore them and keep the code that did it out of runs with an ignore comment.`,
  )
}

/**
 * Finds what fails an attempt.
 *
 * @param outcome - What the attempt left behind.
 * @param handle - Live session.
 * @param target - The test file.
 * @returns The first error of the file, snapshots that fail it with every test
 *   passing among them, else the message of a failed test; null when it
 *   passed.
 */
function readFailure(
  outcome: UnitOutcome,
  handle: JestHandle,
  target: RepeatTarget,
): string | null {
  let { entry, tests } = buildDryFile(outcome, {
    project: target.project,
    root: handle.root,
    file: target.file,
  })
  if (entry.loadFailed) {
    return entry.errors[0]!
  }
  let failed = tests.find(test => test.tries[0]!.failed)
  return failed === undefined ? null : failed.tries[0]!.message
}
