import type { RehypePlugin } from '@astrojs/markdown-remark'

import type { HastNode } from './wrap-elements'

import { wrapElements } from './wrap-elements'
import { readIcon } from './read-icon'
import { getText } from './get-text'

/**
 * Icons of the button: copy, then the check shown once the code is copied.
 */
let icons = ['copy', 'copy-check'].map(name => readIcon(name))

/**
 * Puts a copy button next to every code block. The content layout copies the
 * code when the button is clicked. A single shell line gets the class of a
 * command, as on the home page.
 *
 * @returns Transformer that adds the buttons to a page.
 */
export let rehypeCopyButtons: RehypePlugin = () => tree => {
  wrapElements(
    tree,
    node => node.tagName === 'pre',
    code => ({
      children: [
        code,
        {
          properties: {
            className: ['copy-button'],
            ariaLabel: 'Copy code',
            type: 'button',
          },
          children: icons.map(icon => structuredClone(icon)),
          tagName: 'button',
          type: 'element',
        },
      ],
      properties: {
        className: ['code-block', ...(isShellLine(code) ? ['command'] : [])],
      },
      type: 'element',
      tagName: 'div',
    }),
  )
}

/**
 * Tells whether a code block holds a single line of a shell.
 *
 * @param code - Element of the code block.
 * @returns True for one line in the language `sh`.
 */
function isShellLine(code: HastNode): boolean {
  let language =
    code.properties?.['dataLanguage'] ?? code.properties?.['data-language']
  return language === 'sh' && !getText(code).trim().includes('\n')
}
