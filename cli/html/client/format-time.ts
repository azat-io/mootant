import { formatDuration } from '../../report/format-duration'

/**
 * Formats milliseconds for the report: as the terminal does from a second up,
 * in whole milliseconds below it.
 *
 * @param milliseconds - Duration.
 * @returns Text such as `<1 ms`, `46 ms`, `1.8s` or `2m 05s`.
 */
export function formatTime(milliseconds: number): string {
  if (milliseconds >= 1000) {
    return formatDuration(milliseconds)
  }
  return milliseconds < 1 ? '<1 ms' : `${Math.round(milliseconds)} ms`
}
