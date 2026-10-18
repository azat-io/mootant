import type { NodeTestUnit } from '../types/node-test-unit'

/**
 * Reads what the test process runs from `MOOTANT_UNIT` and removes the
 * variable, so processes the test code starts with the variables of this one,
 * such as through `fork()`, do not take the unit for theirs.
 *
 * @param environment - Environment variables of the process.
 * @param main - Whether the code runs in the main thread; a worker thread loads
 *   the preload too, since it inherits the flags of the process.
 * @returns The unit, or null when this process or thread is not the unit's own,
 *   so the preload stays inert.
 */
export function readUnit(
  environment: NodeJS.ProcessEnv,
  main: boolean,
): NodeTestUnit | null {
  let text = environment['MOOTANT_UNIT']
  delete environment['MOOTANT_UNIT']
  if (!main || text === undefined) {
    return null
  }
  return JSON.parse(text) as NodeTestUnit
}
