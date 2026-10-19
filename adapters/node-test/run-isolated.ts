import path from 'node:path'

import type {
  IsolatedResult,
  IsolatedFacts,
} from '../../types/adapter/isolated-result'
import type { TestProcessOutcome } from './types/test-process-outcome'
import type { IsolatedPlan } from '../../types/adapter/isolated-plan'
import type { NodeTestHandle } from './types/node-test-handle'

import { collectNodeDependencies } from './collect-node-dependencies'
import { buildIsolatedFacts } from './build-isolated-facts'
import { writeSwitchPlan } from './write-switch-plan'
import { getUnitDeadline } from './get-unit-deadline'
import { checkTodoBail } from './check-todo-bail'
import { runTestFile } from './run-test-file'
import { runInPool } from './run-in-pool'

/**
 * Executes isolated units, each in a test process of its own with its mutant
 * active from the start, with the session's processes at once but never two
 * units of one test file at once, in plan order per file (`runInPool`). A unit
 * stops starting tests after a test failed once the mutant was reached, unless
 * its test file reported a todo test or suite in its dry run, since node:test
 * reports todo tests only some time after they ran; tests that failed in the
 * file's dry run of a process that still exited with 0 never count. A unit that
 * stopped for a failure that turned out a todo test, as one that only the
 * mutant made todo, runs again without stopping (`checkTodoBail`). A watchdog
 * stops a unit past its timeout (`getUnitDeadline`). Every unit reports its
 * facts (`buildIsolatedFacts`) and, once its process reached its end, what it
 * read, to the result and, as it ends, to the context's `onUnitEnd`.
 *
 * @param handle - Live session.
 * @param plan - Units to run.
 * @returns Facts of every unit.
 */
export async function runIsolated(
  handle: NodeTestHandle,
  plan: IsolatedPlan,
): Promise<IsolatedResult> {
  let { context, state } = handle
  let switchPlan =
    state.plan ??
    writeSwitchPlan(path.join(context.workDirectory, 'switched'), context.files)
  state.plan = switchPlan
  let cache = { tsconfigs: new Map(), packages: new Map() }
  let units = await runInPool(
    plan.units.map((unit, index) => ({
      run: async (): Promise<IsolatedFacts> => {
        let { mutant, limits, file } = unit
        /**
         * Runs the unit's test process.
         *
         * @param bail - Whether it stops starting tests after a failure.
         * @returns What the process left behind.
         */
        function run(bail: boolean): Promise<TestProcessOutcome> {
          return runTestFile(handle, {
            deadline: watch => getUnitDeadline(watch, limits.timeout),
            expected: state.expected.get(file) ?? [],
            hitLimit: limits.hitLimit,
            mode: 'isolated',
            plan: switchPlan,
            mutant,
            bail,
            file,
          })
        }
        let outcome = await run(state.todo.get(file) !== true)
        if (checkTodoBail(outcome.records)) {
          outcome = await run(false)
        }
        let facts = buildIsolatedFacts(outcome, {
          root: context.root,
          unit: index,
          mutant,
          file,
        })
        let end = outcome.records.find(record => record.kind === 'end')
        facts.inputs =
          end === undefined ? null : (
            {
              dependencies: collectNodeDependencies({
                records: outcome.records,
                preload: handle.preload,
                tsx: handle.tsx,
                cache,
                file,
              })!,
              environment: end.environment,
            }
          )
        context.onUnitEnd?.({ unit: index, facts })
        return facts
      },
      key: unit.file,
    })),
    handle.workers,
  )
  return { units }
}
