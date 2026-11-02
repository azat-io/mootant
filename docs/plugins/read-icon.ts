import { fromHtml } from 'hast-util-from-html'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import type { HastNode } from './wrap-elements'

/**
 * Reads an icon from the icons of the docs. It comes as a node of the HTML tree
 * and not as raw markup, because MDX cannot handle raw nodes from plugins.
 *
 * @param name - File name of the icon without the extension.
 * @returns Element of the icon.
 */
export function readIcon(name: string): HastNode {
  let markup = readFileSync(
    path.join(import.meta.dirname, '..', 'icons', `${name}.svg`),
    'utf8',
  )
  let { children } = fromHtml(markup, { fragment: true, space: 'svg' })
  return children.find(({ type }) => type === 'element') as HastNode
}
