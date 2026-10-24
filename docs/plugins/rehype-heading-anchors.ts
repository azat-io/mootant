import type { RehypePlugin } from '@astrojs/markdown-remark'

import { wrapElements } from './wrap-elements'
import { readIcon } from './read-icon'

let icon = readIcon('hash')

/**
 * Puts a link with a hash icon next to every second and third level heading.
 * The link stays outside the heading, so the heading text reads the same to
 * screen readers. Needs the ids that `rehypeHeadingIds` gives headings.
 *
 * @returns Transformer that adds the links to a page.
 */
export let rehypeHeadingAnchors: RehypePlugin = () => (tree, file) => {
  let titles = new Map(
    file.data.astro?.headings?.map(({ slug, text }) => [slug, text]),
  )
  wrapElements(
    tree,
    node =>
      (node.tagName === 'h2' || node.tagName === 'h3') &&
      typeof node.properties?.['id'] === 'string',
    heading => {
      let id = String(heading.properties?.['id'])
      return {
        children: [
          heading,
          {
            properties: {
              ariaLabel: `Link to ${titles.get(id) ?? id}`,
              className: ['heading-anchor'],
              href: `#${id}`,
            },
            children: [{ type: 'raw', value: icon }],
            type: 'element',
            tagName: 'a',
          },
        ],
        properties: { className: ['heading'] },
        type: 'element',
        tagName: 'div',
      }
    },
  )
}
