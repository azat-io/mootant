import type { TryLimits } from '../../types/adapter/try-limits'
import type { LimitSettings } from '../../types/run/run-state'

/**
 * Computes the limits of a try or of loading a test file from what the dry run
 * measured: the timeout is `scale × (ceil(factor × duration) + constant)`
 * milliseconds and the hit limit `max(floor, factor × hits)`.
 *
 * @param baseline - Slower duration and larger hit count of the dry run.
 * @param baseline.duration - Milliseconds.
 * @param baseline.hits - Site evaluations.
 * @param settings - Factors, constant and floor of the run.
 * @param scale - 1, or 2 to confirm a timeout.
 * @returns Hit limit and timeout.
 */
export function getTryLimits(
  baseline: { duration: number; hits: number },
  settings: LimitSettings,
  scale: number,
): TryLimits {
  let { hitLimit, timeout } = settings
  return {
    timeout:
      scale *
      (Math.ceil(timeout.factor * baseline.duration) + timeout.constant),
    hitLimit: Math.max(hitLimit.floor, hitLimit.factor * baseline.hits),
  }
}
