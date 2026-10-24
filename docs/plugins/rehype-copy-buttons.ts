import type { RehypePlugin } from '@astrojs/markdown-remark'

import { wrapElements } from './wrap-elements'
import { readIcon } from './read-icon'

/**
 * Icons of the button: copy, then the check shown once the code is copied.
 */
let icons = ['copy', 'copy-check'].map(name => readIcon(name))

/**
 * Puts a copy button next to every code block. The content layout copies the
 * code when the button is clicked.
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
          children: icons.map(icon => ({ type: 'raw', value: icon })),
          tagName: 'button',
          type: 'element',
        },
      ],
      properties: { className: ['code-block'] },
      type: 'element',
      tagName: 'div',
    }),
  )
}
