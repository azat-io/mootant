import type { RunSettings } from '../../types/config/run-settings'
import type { RunConfig } from '../../types/config/run-config'

/**
 * Resolves the settings of a run: an option of the command line wins over the
 * configuration, which wins over the default. The defaults are those
 * `RunConfig` documents: the runner's own concurrency, no threshold, a timeout
 * factor of 3 with a constant of 250, a hit limit factor of 100 with a floor of
 * 100000, the cache on, and incremental and fast mode off.
 *
 * @param options - Settings given on the command line, undefined when not
 *   given.
 * @param run - Run settings of the configuration, or an empty object.
 * @returns Settings of the run with the defaults filled in.
 */
export function resolveRunSettings(
  options: Pick<
    RunConfig,
    'concurrency' | 'incremental' | 'threshold' | 'cache' | 'fast'
  >,
  run: RunConfig,
): RunSettings {
  return {
    limits: {
      hitLimit: {
        floor: run.hitLimit?.floor ?? 100_000,
        factor: run.hitLimit?.factor ?? 100,
      },
      timeout: {
        constant: run.timeout?.constant ?? 250,
        factor: run.timeout?.factor ?? 3,
      },
    },
    incremental: options.incremental ?? run.incremental ?? false,
    concurrency: options.concurrency ?? run.concurrency ?? null,
    threshold: options.threshold ?? run.threshold ?? null,
    cache: options.cache ?? run.cache ?? true,
    fast: options.fast ?? run.fast ?? false,
  }
}
