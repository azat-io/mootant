/**
 * Formats the time a report was written for its pages, in the time zone of the
 * reader.
 *
 * @param date - Time as an ISO string.
 * @returns Text such as `27 Oct 2026, 13:05`.
 */
export function formatDate(date: string): string {
  let time = new Date(date)
  let day = time.toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
  let clock = time.toLocaleTimeString('en-GB', {
    minute: '2-digit',
    hour: '2-digit',
  })
  return `${day}, ${clock}`
}
