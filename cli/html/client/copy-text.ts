/**
 * Milliseconds a button shows that it copied.
 */
const COPIED_TIME = 2000

/**
 * Copies text and marks the button that asked for it with `data-copied` for a
 * while, as the copy buttons of the docs do. A browser without the clipboard
 * API, or one that refuses it for a file, copies through a selected text area.
 *
 * @param button - Button that asked for the copy.
 * @param text - Text to copy.
 */
export async function copyText(
  button: HTMLElement,
  text: string,
): Promise<void> {
  let { document } = button.ownerDocument.defaultView!
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    let area = document.createElement('textarea')
    area.value = text
    document.body.append(area)
    area.select()
    document.execCommand('copy')
    area.remove()
  }
  button.dataset['copied'] = ''
  setTimeout(() => {
    delete button.dataset['copied']
  }, COPIED_TIME)
}
