import { readdirSync } from 'node:fs'
import path from 'node:path'

import type { VitestOutRecord, VitestHeartbeat } from './types/vitest-worker'
import type { IsolatedUnit } from '../../types/adapter/isolated-plan'
import type { VitestHandle } from './types/vitest-session-state'
import type { BatchUnit } from '../../types/adapter/batch-plan'

import { resetRunDirectory } from './reset-run-directory'
import { runSpecifications } from './run-specifications'
import { watchHeartbeats } from './watch-heartbeats'
import { stopHungWorker } from './stop-hung-worker'
import { writePlanFiles } from './write-plan-files'
import { readOutFiles } from './read-out-files'

/**
 * What one unit of a run left behind.
 */
interface UnitOutcome {
  /**
   * Last heartbeat of the worker the watchdog stopped, or null.
   */
  hung: VitestHeartbeat | null

  /**
   * Records the worker wrote, in order.
   */
  records: VitestOutRecord[]

  /**
   * Whether a worker claimed the unit.
   */
  claimed: boolean
}

/**
 * Runs the units of a batch or isolated plan in one Vitest run: writes the plan
 * files, creates one specification per unit in the unit's project, and stops
 * hung workers while the run goes on. Several workers may get the same test
 * file; each claims the next unit of the file and waits until the unit before
 * it finished (`waitForTurn`), so a test file never runs twice at once. A
 * concurrency lowers every project's `maxWorkers` for this run.
 *
 * @param handle - Live Vitest instance of the session.
 * @param plan - Kind of the run, units in plan order and the most units at
 *   once, if lowered.
 * @param plan.mode - Kind of the run.
 * @param plan.units - Units in plan order.
 * @param plan.concurrency - Most units at once, or undefined to keep the
 *   setting.
 * @returns What each unit left behind, in plan order, and the first unhandled
 *   error of the run, or null.
 */
export async function runPlan(
  handle: VitestHandle,
  plan: {
    units: readonly (IsolatedUnit | BatchUnit)[]
    mode: 'isolated' | 'batch'
    concurrency?: number
  },
): Promise<{ units: UnitOutcome[]; error: string | null }> {
  let { units, mode } = plan
  let { vitest } = handle
  let directory = handle.context.workDirectory
  resetRunDirectory(directory)
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
  let error: string | null
  try {
    error = await runSpecifications(
      handle,
      { timeouts: null, repeat: false, mode },
      specifications,
    )
  } finally {
    await watch.stop()
    for (let [index, config] of settings.entries()) {
      config.maxWorkers = maxWorkers[index]!
    }
  }
  let records = readOutFiles(directory)
  let claims = new Set(readdirSync(path.join(directory, 'claim')))
  return {
    units: names.map((name, index) => ({
      records: records.get(name) ?? [],
      hung: hung.get(index) ?? null,
      claimed: claims.has(name),
    })),
    error,
  }
}
