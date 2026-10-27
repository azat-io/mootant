/**
 * Milliseconds a downloaded file stays at its object URL, so that a slow
 * browser can still read it.
 */
const KEEP_URL = 60_000

/**
 * Saves a value as a JSON file through a link with the `download` attribute.
 *
 * @param document - Page that starts the download.
 * @param name - Name of the file.
 * @param value - Value to save.
 */
export function downloadJson(
  document: Document,
  name: string,
  value: unknown,
): void {
  let window = document.defaultView!
  let url = window.URL.createObjectURL(
    new window.Blob([JSON.stringify(value)], { type: 'application/json' }),
  )
  let link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  window.setTimeout(() => {
    window.URL.revokeObjectURL(url)
  }, KEEP_URL)
}
