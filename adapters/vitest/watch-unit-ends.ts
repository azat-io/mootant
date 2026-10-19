import { readdirSync } from 'node:fs'
import path from 'node:path'

/**
 * Running watch of the finished units of one Vitest run.
 */
interface UnitEndWatch {
  /**
   * Stops polling after a last look, so units that finished since the previous
   * look still count.
   */
  stop(): void
}

/**
 * Milliseconds between two looks at the finished units.
 */
const POLL_INTERVAL = 200

/**
 * Watches the `done` folder of a run, where a worker creates one file as each
 * unit or dry test file ends, and calls back once per new file with its name.
 * Without a callback nothing is watched.
 *
 * @param directory - Work directory of the session.
 * @param onUnitEnd - Called once per finished unit with the name of its file,
 *   if given.
 * @returns Watch to stop after the run.
 */
export function watchUnitEnds(
  directory: string,
  onUnitEnd: ((name: string) => void) | undefined,
): UnitEndWatch {
  if (onUnitEnd === undefined) {
    return { stop: () => {} }
  }
  let folder = path.join(directory, 'done')
  let seen = new Set<string>()
  /**
   * Calls back for the units that finished since the last look.
   */
  function look(): void {
    for (let name of readdirSync(folder).toSorted()) {
      if (!seen.has(name)) {
        seen.add(name)
        onUnitEnd!(name)
      }
    }
  }
  let timer = setInterval(look, POLL_INTERVAL)
  return {
    stop: () => {
      clearInterval(timer)
      look()
    },
  }
}
