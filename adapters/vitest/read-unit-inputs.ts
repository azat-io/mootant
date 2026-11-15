import type { VitestHandle } from './types/vitest-session-state'
import type { RunInputs } from '../../types/adapter/run-inputs'

import { collectDependencies } from './collect-dependencies'

/**
 * Turns what the worker of a batch or isolated unit reported it read into the
 * inputs of the unit, the same way as for a dry run (`collectDependencies`). A
 * unit whose unhandled errors `onUnhandledError` of the root configuration
 * decided has no inputs, as what that callback depends on is out of sight, so
 * the cache never stores its verdicts.
 *
 * @param handle - Live Vitest instance of the session.
 * @param unit - Test file and project of the unit.
 * @param unit.project - Name of the project the unit ran in.
 * @param unit.file - Absolute path of the test file.
 * @param unit.tsconfigs - `tsconfig.json` files found before, by directory;
 *   shared by the units of a run.
 * @param reported - What the worker reported, or undefined without an end
 *   record.
 * @param reported.dependencies - Module ids and paths of `listDependencies`, or
 *   null when the worker could not tell.
 * @param reported.environment - Names of the environment variables read.
 * @param reported.filtered - Whether `onUnhandledError` decided an unhandled
 *   error of the unit.
 * @returns Inputs of the unit, or null without a report or dependencies.
 */
export async function readUnitInputs(
  handle: VitestHandle,
  unit: { tsconfigs: Map<string, string[]>; project: string; file: string },
  reported:
    | {
        dependencies: string[] | null
        environment: string[]
        filtered: boolean
      }
    | undefined,
): Promise<RunInputs | null> {
  if (reported === undefined || reported.filtered) {
    return null
  }
  let dependencies = await collectDependencies({
    project: handle.vitest.getProjectByName(unit.project),
    reported: reported.dependencies,
    tsconfigs: unit.tsconfigs,
    file: unit.file,
  })
  return dependencies === null ? null : (
      { environment: reported.environment, dependencies }
    )
}
