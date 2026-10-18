import type { BuiltInAdapters } from '../../types/adapter/built-in-adapters'
import type { TestAdapter } from '../../types/adapter/test-adapter'

import { validateAdapter } from './validate-adapter'

/**
 * Adapter of a run, with a note on how it was chosen.
 */
interface ResolvedAdapter {
  /**
   * Adapter to start the session with.
   */
  adapter: TestAdapter

  /**
   * Note when detection found several test runners equally likely and took the
   * first, or null.
   */
  note: string | null
}

/**
 * Finds the test runner adapter of a run: an adapter object from the
 * configuration is checked; a built-in name loads that adapter; without a
 * setting, the built-in adapter whose detection scores highest is used: a test
 * runner the project's test scripts call beats one that is only installed, and
 * a tie goes to the first in detection order, with a note that names the others
 * and `run.runner`. Other adapters are objects the configuration file imports,
 * as plugins are.
 *
 * @param setting - `run.runner` of the configuration, if any.
 * @param root - Project root.
 * @param builtIns - Adapters that come with mootant, in detection order.
 * @returns Adapter to start the session with and the note of a tie.
 * @throws Error - When no adapter is detected, a name is not built in, or an
 *   adapter has the wrong shape.
 */
export async function resolveAdapter(
  setting: TestAdapter | undefined | string,
  root: string,
  builtIns: BuiltInAdapters,
): Promise<ResolvedAdapter> {
  let names = Object.keys(builtIns)
  let listed = names.join(', ')
  if (setting === undefined) {
    let scores = await Promise.all(
      Object.values(builtIns).map(async candidate =>
        Number(await candidate.detect(root)),
      ),
    )
    let best = Math.max(0, ...scores)
    let tied = names.filter((_name, index) => scores[index] === best)
    if (best > 0) {
      return {
        note:
          tied.length > 1 ?
            `Found several test runners (${tied.join(', ')}) and used ${tied[0]}; set run.runner to choose another.`
          : null,
        adapter: await builtIns[tied[0]!]!.load(),
      }
    }
    throw new Error(
      `No supported test runner found in ${root}. Install one (${listed}) or set run.runner in the configuration.`,
    )
  }
  if (typeof setting !== 'string') {
    return { adapter: validateAdapter(setting, 'run.runner'), note: null }
  }
  if (Object.hasOwn(builtIns, setting)) {
    return { adapter: await builtIns[setting]!.load(), note: null }
  }
  throw new Error(
    `Unknown test runner "${setting}" in run.runner: use a built-in name (${listed}) or import an adapter object in the configuration.`,
  )
}
