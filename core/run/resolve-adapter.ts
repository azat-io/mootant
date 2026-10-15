import type { BuiltInAdapters } from '../../types/adapter/built-in-adapters'
import type { TestAdapter } from '../../types/adapter/test-adapter'

import { validateAdapter } from './validate-adapter'

/**
 * Finds the test runner adapter of a run: an adapter object from the
 * configuration is checked; a built-in name loads that adapter; without a
 * setting, the first built-in adapter that detects its test runner in the root
 * is used. Other adapters are objects the configuration file imports, as
 * plugins are.
 *
 * @param setting - `run.runner` of the configuration, if any.
 * @param root - Project root.
 * @param builtIns - Adapters that come with mootant, in detection order.
 * @returns Adapter to start the session with.
 * @throws Error - When no adapter is detected, a name is not built in, or an
 *   adapter has the wrong shape.
 */
export async function resolveAdapter(
  setting: TestAdapter | undefined | string,
  root: string,
  builtIns: BuiltInAdapters,
): Promise<TestAdapter> {
  let names = Object.keys(builtIns).join(', ')
  if (setting === undefined) {
    let candidates = Object.values(builtIns)
    let detected = await Promise.all(
      candidates.map(candidate => candidate.detect(root)),
    )
    let found = candidates.find((_candidate, index) => detected[index])
    if (found !== undefined) {
      return found.load()
    }
    throw new Error(
      `No supported test runner found in ${root}. Install one (${names}) or set run.runner in the configuration.`,
    )
  }
  if (typeof setting !== 'string') {
    return validateAdapter(setting, 'run.runner')
  }
  if (Object.hasOwn(builtIns, setting)) {
    return builtIns[setting]!.load()
  }
  throw new Error(
    `Unknown test runner "${setting}" in run.runner: use a built-in name (${names}) or import an adapter object in the configuration.`,
  )
}
