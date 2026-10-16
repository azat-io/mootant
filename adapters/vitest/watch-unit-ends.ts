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
 * unit or dry test file ends, and calls back once per new file. Without a
 * callback nothing is watched.
 *
 * @param directory - Work directory of the session.
 * @param onUnitEnd - Called once per finished unit, if given.
 * @returns Watch to stop after the run.
 */
export function watchUnitEnds(
  directory: string,
  onUnitEnd: (() => void) | undefined,
): UnitEndWatch {
  if (onUnitEnd === undefined) {
    return { stop: () => {} }
  }
  let folder = path.join(directory, 'done')
  let seen = 0
  /**
   * Counts the finished units and calls back for the new ones.
   */
  function look(): void {
    let count = readdirSync(folder).length
    for (; seen < count; seen++) {
      onUnitEnd!()
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
