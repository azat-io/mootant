import type { NodeTestUnit } from '../types/node-test-unit'

import { readLineSync } from './read-line-sync'

/**
 * Reads what the test process runs and removes the variables that carry it, so
 * processes the test code starts with the variables of this one, such as
 * through `fork()`, do not take the unit for theirs. The unit comes as a line
 * through the file descriptor in `MOOTANT_UNIT_FD`; the process waits for it
 * there, which lets a spare process start before mootant knows its unit, and
 * closes the descriptor once read. A process that gets no line, as a spare that
 * mootant no longer needs or whose mootant is gone, exits at once, before any
 * module of the project loads. Where mootant sends no line, as on Windows, the
 * unit is in `MOOTANT_UNIT`.
 *
 * @param target - The process, with its environment variables and its exit.
 * @param main - Whether the code runs in the main thread; a worker thread loads
 *   the preload too, since it inherits the flags of the process.
 * @returns The unit, or null when this process or thread is not the unit's own,
 *   so the preload stays inert.
 */
export function readUnit(
  target: Pick<NodeJS.Process, 'exit' | 'env'>,
  main: boolean,
): NodeTestUnit | null {
  let { env } = target
  let text = env['MOOTANT_UNIT']
  let descriptor = env['MOOTANT_UNIT_FD']
  delete env['MOOTANT_UNIT']
  delete env['MOOTANT_UNIT_FD']
  if (!main) {
    return null
  }
  if (descriptor !== undefined) {
    text = readLineSync(Number(descriptor)) ?? target.exit()
  }
  return text === undefined ? null : (JSON.parse(text) as NodeTestUnit)
}
