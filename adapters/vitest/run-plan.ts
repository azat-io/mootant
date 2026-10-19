import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

import type { IsolatedFacts } from '../../types/adapter/isolated-result'
import type { IsolatedUnit } from '../../types/adapter/isolated-plan'
import type { VitestHandle } from './types/vitest-session-state'
import type { BatchUnit } from '../../types/adapter/batch-plan'
import type { VitestHeartbeat } from './types/vitest-worker'
import type { UnitOutcome } from './types/unit-outcome'

import { resetRunDirectory } from './reset-run-directory'
import { runSpecifications } from './run-specifications'
import { watchHeartbeats } from './watch-heartbeats'
import { stopHungWorker } from './stop-hung-worker'
import { writePlanFiles } from './write-plan-files'
import { watchUnitEnds } from './watch-unit-ends'
import { readOutFiles } from './read-out-files'
import { readOutFile } from './read-out-file'

/**
 * Runs the units of a batch or isolated plan in one Vitest run: writes the plan
 * files, creates one specification per unit in the unit's project, and stops
 * hung workers and counts finished units while the run goes on. Several workers
 * may get the same test file; each claims the next unit of the file and waits
 * until the unit before it finished (`waitForTurn`), so a test file never runs
 * twice at once. A concurrency lowers every project's `maxWorkers` for this
 * run. A unit counts as finished when its worker marks it done or, once the run
 * is over, when a worker claimed it and died or was stopped before it could, so
 * the progress reaches the number of units that ran. The context's `onUnitEnd`
 * gets the index of each finished unit and, for a unit its worker marked done,
 * its facts with `describe`, else how long it ran, from its records.
 *
 * @param handle - Live Vitest instance of the session.
 * @param plan - Kind of the run, units in plan order and the most units at
 *   once, if lowered.
 * @param plan.mode - Kind of the run.
 * @param plan.units - Units in plan order.
 * @param plan.concurrency - Most units at once, or undefined to keep the
 *   setting.
 * @param plan.describe - Builds the facts of a unit its worker marked done, if
 *   given.
 * @returns What each unit left behind, in plan order, and the first unhandled
 *   error of the run, or null.
 */
export async function runPlan(
  handle: VitestHandle,
  plan: {
    describe?(
      unit: number,
      outcome: Omit<UnitOutcome, 'claimed'>,
    ): IsolatedFacts
    units: readonly (IsolatedUnit | BatchUnit)[]
    mode: 'isolated' | 'batch'
    concurrency?: number
  },
): Promise<{ units: UnitOutcome[]; error: string | null }> {
  let { units, mode } = plan
  let { vitest } = handle
  let directory = handle.context.workDirectory
  resetRunDirectory(directory)
  handle.state.spawns.clear()
  let names = await writePlanFiles(directory, units)
  let specifications = units.map(unit =>
    vitest.getProjectByName(unit.project).createSpecification(unit.file),
  )
  let settings = vitest.projects.map(project => project.config)
  let maxWorkers = settings.map(config => config.maxWorkers)
  if (plan.concurrency !== undefined) {
    for (let config of settings) {
      config.maxWorkers = Math.min(config.maxWorkers, plan.concurrency)
    }
  }
  let hung = new Map<number, VitestHeartbeat>()
  let watch = watchHeartbeats(directory, async beat => {
    if (await stopHungWorker(beat.pid)) {
      hung.set(beat.unit, beat)
    }
  })
  let { onUnitEnd } = handle.context
  let indexes = new Map(names.map((name, index) => [name, index]))
  let ends = watchUnitEnds(
    directory,
    onUnitEnd === undefined ? undefined : (
      name => {
        let unit = indexes.get(name)!
        let records = readOutFile(path.join(directory, 'out', `${name}.jsonl`))
        if (plan.describe === undefined) {
          let end = records.find(record => record.kind === 'end')
          onUnitEnd(
            end === undefined ? { unit } : { duration: end.duration, unit },
          )
          return
        }
        onUnitEnd({
          facts: plan.describe(unit, {
            pid: Number(
              readFileSync(path.join(directory, 'claim', name), 'utf8'),
            ),
            hung: null,
            records,
          }),
          unit,
        })
      }
    ),
  )
  let error: string | null
  try {
    error = await runSpecifications(
      handle,
      { timeouts: null, repeat: false, mode },
      specifications,
    )
  } finally {
    ends.stop()
    await watch.stop()
    for (let [index, config] of settings.entries()) {
      config.maxWorkers = maxWorkers[index]!
    }
  }
  let records = readOutFiles(directory)
  let claims = new Set(readdirSync(path.join(directory, 'claim')))
  let done = new Set(readdirSync(path.join(directory, 'done')))
  for (let [unit, name] of names.entries()) {
    if (claims.has(name) && !done.has(name)) {
      onUnitEnd?.({ unit })
    }
  }
  return {
    units: names.map((name, index) => {
      let claimed = claims.has(name)
      return {
        pid:
          claimed ?
            Number(readFileSync(path.join(directory, 'claim', name), 'utf8'))
          : null,
        records: records.get(name) ?? [],
        hung: hung.get(index) ?? null,
        claimed,
      }
    }),
    error,
  }
}
