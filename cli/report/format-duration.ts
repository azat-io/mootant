/**
 * Formats milliseconds for people: tenths of a second under a minute, then
 * minutes and seconds, then hours and minutes.
 *
 * @param milliseconds - Length of time to show.
 * @returns Text such as `0.4s`, `41.2s`, `1m 05s` or `1h 02m`.
 */
export function formatDuration(milliseconds: number): string {
  let tenths = Math.round(Math.max(0, milliseconds) / 100)
  if (tenths < 600) {
    return `${(tenths / 10).toFixed(1)}s`
  }
  let seconds = Math.round(milliseconds / 1000)
  if (seconds < 3600) {
    return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`
  }
  let minutes = Math.round(seconds / 60)
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`
}
