import type { BuiltInAdapters } from '../../types/adapter/built-in-adapters'
import type { TestAdapter } from '../../types/adapter/test-adapter'

/**
 * Creates built-in adapters with only the given adapter, detected in every
 * project.
 *
 * @param name - Name `run.runner` uses for the adapter, such as `vitest`.
 * @param adapter - Adapter that name loads.
 * @returns Built-in adapters of a run.
 */
export function createBuiltIns(
  name: string,
  adapter: TestAdapter,
): BuiltInAdapters {
  return {
    [name]: {
      load: () => Promise.resolve(adapter),
      detect: () => Promise.resolve(true),
    },
  }
}
