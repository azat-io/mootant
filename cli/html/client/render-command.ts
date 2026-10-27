import { escapeHtml } from './escape-html'
import { getIcon } from './get-icon'
import { html } from './html'

/**
 * Renders a command line as the docs do: a prompt, the command and a button
 * that copies it.
 *
 * @param command - Command line.
 * @returns HTML of the command.
 */
export function renderCommand(command: string): string {
  let text = escapeHtml(command)
  return html`<div class="command">
    <code tabindex="0"><span class="prompt">$ </span>${text}</code
    ><button
      class="copy"
      type="button"
      data-copy="${text}"
      aria-label="Copy command"
    >
      ${getIcon('copy')}${getIcon('copy-check')}
    </button>
  </div>`
}
