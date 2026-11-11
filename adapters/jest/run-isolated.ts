import { mkdirSync } from 'node:fs'
import path from 'node:path'

import type {
  IsolatedResult,
  IsolatedFacts,
} from '../../types/adapter/isolated-result'
import type {
  IsolatedUnit,
  IsolatedPlan,
} from '../../types/adapter/isolated-plan'
import type { TryLimits } from '../../types/adapter/try-limits'
import type { WorkerSlot } from './types/worker-slot'
import type { JestHandle } from './types/jest-handle'

import { collectJestDependencies } from './collect-jest-dependencies'
import { getTestFileKey } from '../../core/run/get-test-file-key'
import { compareCodeUnits } from '../../core/compare-code-units'
import { keepLateTransforms } from './keep-late-transforms'
import { buildIsolatedFacts } from './build-isolated-facts'
import { getUnitDeadline } from './get-unit-deadline'
import { checkRepeatable } from './check-repeatable'
import { runInPool } from '../shared/run-in-pool'
import { runOnWorker } from './run-on-worker'

/**
 * A unit of a plan with what its run needs of it.
 */
interface PlannedUnit {
  /**
   * The unit.
   */
  unit: IsolatedUnit

  /**
   * Index of the unit in the plan.
   */
  index: number

  /**
   * Mutant, test file and project name joined with a zero character.
   */
  key: string
}

/**
 * How a unit of a chain runs.
 */
interface UnitAttempt {
  /**
   * The unit.
   */
  planned: PlannedUnit

  /**
   * Whether this unit had no facts before.
   */
  retrying: boolean

  /**
   * Whether this is a clean attempt.
   */
  clean: boolean
}

/**
 * A unit of a chain that ran.
 */
interface RanUnit extends UnitAttempt {
  /**
   * Facts of the unit, or null.
   */
  facts: IsolatedFacts | null
}

/**
 * Runs the units of a plan on the workers of the session, each from the start
 * of its test file with its mutant active. Every plan starts on a drained pool,
 * so that no warm state crosses plans. The units of a test file run as one
 * chain, in plan order, holding one slot, and chains of one file never overlap,
 * whatever project they are in. The limits of a unit reach the worker as they
 * are, and a test's own timeout stays: a clamp that fires before the reach
 * would read as not covered. Once every chain ended, each unit with inputs also
 * depends on what the transformers, the test environments, the test runners and
 * the projects' own resolvers read so far in isolated units and checks but in
 * no dry run (`state.lateTransforms`), as for a module only mutants load: a
 * warm worker transforms the module once, so a later unit that loads it reads
 * none of that, and on another worker Jest's disk cache may spare `process`.
 *
 * @param handle - Live session.
 * @param plan - Units to run.
 * @returns Facts of the units that have them; the core plans the others once
 *   more.
 * @throws {Error} When the pool is closed, a worker cannot start, an out file
 *   cannot be made, or a test file fails when it runs again without mutants, in
 *   which case no other chain starts.
 */
export async function runIsolated(
  handle: JestHandle,
  plan: IsolatedPlan,
): Promise<IsolatedResult> {
  let { directory, state, pool } = handle
  mkdirSync(path.join(directory, 'out'), { recursive: true })
  await pool.discardAll()
  let chains = new Map<string, PlannedUnit[]>()
  for (let [index, unit] of plan.units.entries()) {
    let chain = chains.get(unit.file) ?? []
    chain.push({
      key: [unit.mutant, unit.file, unit.project].join('\0'),
      index,
      unit,
    })
    chains.set(unit.file, chain)
  }
  let facts = await runInPool(
    [...chains].map(([file, chain]) => ({
      run: () => runChain(handle, chain),
      key: file,
    })),
    pool.size,
  )
  let late = [...state.lateTransforms]
  let units = facts.flat()
  for (let { inputs } of units) {
    if (inputs) {
      inputs.dependencies = [
        ...new Set([...inputs.dependencies, ...late]),
      ].toSorted(compareCodeUnits)
    }
  }
  return { units }
}

/**
 * Runs one unit. A unit with no facts leaves its worker out, since what it met
 * may still be there. A worker that ran out of memory raises the cap of later
 * workers, with a reach or not, so warm workers stop dying of it. Tests get the
 * console plain Jest gives their project: a test may read what one that writes
 * at once wrote, and one that keeps what tests print formats it as they call
 * it, which can throw. Facts tell what the unit read, as a dry file does
 * (`collectJestDependencies`), with the variables the code read. What its
 * transformers, test environment, test runner and own resolver read that no dry
 * run's did joins `state.lateTransforms` (`keepLateTransforms`), facts or not,
 * as a module they gave stays in Jest's disk cache.
 *
 * @param handle - Live session.
 * @param slot - Slot the chain holds.
 * @param attempt - What to run and how.
 * @returns The attempt with the facts of the unit, or null.
 * @throws {Error} When the unit cannot run.
 */
async function runIsolatedUnit(
  handle: JestHandle,
  slot: WorkerSlot,
  attempt: UnitAttempt,
): Promise<RanUnit> {
  let { directory, consoles, projects, context, state, heap, pool, root } =
    handle
  let { retrying, planned, clean } = attempt
  let { index, unit, key } = planned
  let { project, mutant, limits, file } = unit
  let input = {
    unit: index,
    retrying,
    project,
    mutant,
    limits,
    clean,
    root,
    file,
  }
  state.units += 1
  let outcome = await runOnWorker(pool, slot, {
    unit: {
      project: projects.find(({ name }) => name === project)!.config.id,
      out: path.join(directory, 'out', `${state.units}.jsonl`),
      console: consoles.get(project)!,
      hitLimit: limits.hitLimit,
      plan: state.plan,
      mutant,
      file,
    },
    deadline: (records, sent) => getUnitDeadline(records, sent, limits),
    discardWhen: ended => buildIsolatedFacts(ended, input) === null,
    clean,
  })
  let facts = buildIsolatedFacts(outcome, input)
  if (outcome.outOfMemory !== null) {
    heap.raise(outcome.outOfMemory)
  }
  keepLateTransforms(state, outcome.records)
  if (facts === null) {
    state.noFacts.add(key)
  } else {
    let dependencies = collectJestDependencies(outcome.records, file)
    let finish = outcome.records.find(record => record.kind === 'finish')
    facts.inputs =
      dependencies === null ? null : (
        { environment: finish!.variables, dependencies }
      )
  }
  context.onUnitEnd?.(facts === null ? { unit: index } : { unit: index, facts })
  return { ...attempt, facts }
}

/**
 * Runs the units of one test file on one slot, one after another: those that
 * had no facts, as clean attempts; the others, warm; then the check of the
 * units that were not a clean pass, by project and file, on this slot, so that
 * it meets the worker the kills ran on, or its replacement, and what a test
 * keeps per `JEST_WORKER_ID`. Once the check says a file only failed on warm
 * state or a flake, every warm unit of the chain loses its facts and runs clean
 * next time, passes too: what failed the file may have let a mutant pass, such
 * as a property of an object a core module holds, which no guard sees, and the
 * units of the file in another project ran on the same worker. Clean units
 * stand. What a unit leaves in its worker that fails no file of the chain on
 * the worker the check meets, as a worker gone before the check held it, may
 * still sway the verdict of a later unit there: plain Jest gives each mutant a
 * process of its own, and `freshWorkers` does too.
 *
 * @param handle - Live session.
 * @param chain - Units of the test file, in plan order.
 * @returns Facts of the units that have them and that the check left.
 * @throws {Error} When a unit cannot run, or the test file fails when it runs
 *   again without mutants.
 */
async function runChain(
  handle: JestHandle,
  chain: readonly PlannedUnit[],
): Promise<IsolatedFacts[]> {
  let { freshWorkers, state, pool } = handle
  let attempts: UnitAttempt[] = [
    ...chain
      .filter(({ key }) => state.noFacts.has(key))
      .map(planned => ({ retrying: true, clean: true, planned })),
    ...chain
      .filter(({ key }) => !state.noFacts.has(key))
      .map(planned => ({ clean: freshWorkers, retrying: false, planned })),
  ]
  let slot = pool.take()
  try {
    let ran = await runInPool(
      attempts.map(attempt => ({
        run: () => runIsolatedUnit(handle, slot, attempt),
        key: attempt.planned.key,
      })),
      1,
    )
    let warm = await checkRepeatable(handle, slot, listEvidence(ran))
    let takenBack = warm.size > 0 ? ran.filter(({ clean }) => !clean) : []
    for (let { planned } of takenBack) {
      state.noFacts.add(planned.key)
    }
    return ran
      .filter(unit => !takenBack.includes(unit))
      .flatMap(({ facts }) => facts ?? [])
  } finally {
    pool.release(slot)
  }
}

/**
 * Lists the test files with a unit that was not a clean pass, each once per
 * project.
 *
 * @param ran - Units of a chain that ran.
 * @returns The files in the order of those units.
 */
function listEvidence(
  ran: readonly RanUnit[],
): { project: string; file: string }[] {
  let files = new Map(
    ran
      .filter(
        ({ planned: { unit }, facts }) => !isCleanPass(facts, unit.limits),
      )
      .map(({ planned: { unit } }) => {
        let { project, file } = unit
        return [getTestFileKey({ project, file }), { project, file }]
      }),
  )
  return [...files.values()]
}

/**
 * Tells whether what a unit gave says nothing failed.
 *
 * @param facts - Facts of the unit, or null.
 * @param limits - Limits of the unit.
 * @returns Whether it has facts, ended, and neither its file nor a test failed,
 *   timed out or ran past the hit limit.
 */
function isCleanPass(facts: IsolatedFacts | null, limits: TryLimits): boolean {
  return (
    facts !== null &&
    facts.incomplete === null &&
    facts.loadError === null &&
    facts.hookError === null &&
    !facts.timedOut &&
    facts.hits <= limits.hitLimit &&
    facts.tests.every(test => !test.failed && !test.timedOut)
  )
}
