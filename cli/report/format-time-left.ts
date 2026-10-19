/**
 * Formats an estimate of the time left for people, rounded up to steps that
 * keep it from flickering: 5 seconds under a minute, 10 seconds under ten
 * minutes, then minutes, then hours and minutes. The step is rounded first, so
 * a time that rounds up to the next form takes that form.
 *
 * @param milliseconds - Estimated time left.
 * @returns Text such as `~15s`, `~1m 10s`, `~12m` or `~1h 05m`.
 */
export function formatTimeLeft(milliseconds: number): string {
  let seconds = Math.max(1, Math.ceil(milliseconds / 1000))
  let fives = Math.ceil(seconds / 5) * 5
  if (fives < 60) {
    return `~${fives}s`
  }
  let tens = Math.ceil(seconds / 10) * 10
  if (tens < 600) {
    return `~${Math.floor(tens / 60)}m ${String(tens % 60).padStart(2, '0')}s`
  }
  let minutes = Math.ceil(seconds / 60)
  if (minutes < 60) {
    return `~${minutes}m`
  }
  return `~${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`
}
