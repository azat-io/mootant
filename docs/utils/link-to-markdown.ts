import remarkParse from 'remark-parse'
import { unified } from 'unified'

/**
 * Node of the Markdown tree that the links are found in. It lists only the
 * fields that the search uses.
 */
interface LinkNode {
  /**
   * Offsets of the node in the Markdown.
   */
  position?: {
    start: { offset?: number }
    end: { offset?: number }
  }

  /**
   * Nodes inside the node.
   */
  children?: LinkNode[]

  /**
   * Address of a link, an image or a link definition.
   */
  url?: string

  /**
   * Kind of the node, such as `link`.
   */
  type: string
}

/**
 * Address to write in place of another one.
 */
interface Replacement {
  /**
   * Offset of the address in the Markdown.
   */
  start: number

  /**
   * Address as the Markdown has it.
   */
  url: string
}

/**
 * Nodes that hold an address in their `url`.
 */
const LINK_TYPES = new Set(['definition', 'image', 'link'])

/**
 * Makes the links of a Markdown page absolute, so they work wherever an agent
 * reads the text, and points links to pages of the docs at their Markdown:
 * `/guide/cli#shared-options` becomes
 * `https://mootant.org/guide/cli.md#shared-options`. Links to other files of
 * the site only become absolute. Links to other sites and to headings of the
 * same page stay as written, and so does code.
 *
 * @param markdown - Markdown of a page.
 * @param pages - Addresses of the pages with a Markdown version, such as
 *   `/guide/cli`.
 * @param site - Address of the docs.
 * @returns Markdown with the new links.
 */
export function linkToMarkdown(
  markdown: string,
  pages: Set<string>,
  site: undefined | URL,
): string {
  let tree = unified().use(remarkParse).parse(markdown) as LinkNode
  let replacements = findLinks(tree)
    .flatMap(node => findReplacement(node, markdown))
    .toSorted((first, second) => first.start - second.start)
  let parts: string[] = []
  let offset = 0
  for (let { start, url } of replacements) {
    parts.push(markdown.slice(offset, start), toMarkdownUrl(url, pages, site))
    offset = start + url.length
  }
  parts.push(markdown.slice(offset))
  return parts.join('')
}

/**
 * Finds where the source of a link holds an address of this site, such as
 * `/guide/cli`. The address is the last one in the source of the link, after
 * its text.
 *
 * @param node - Link, image or link definition.
 * @param markdown - Markdown of the page.
 * @returns The address to replace, or nothing for another site, a heading of
 *   the same page or an address the source writes differently.
 */
function findReplacement(node: LinkNode, markdown: string): Replacement[] {
  let url = node.url ?? ''
  let start = node.position?.start.offset ?? 0
  let end = node.position?.end.offset ?? start
  let index = markdown.slice(start, end).lastIndexOf(url)
  if (index === -1 || !url.startsWith('/') || url.startsWith('//')) {
    return []
  }
  return [{ start: start + index, url }]
}

/**
 * Writes the absolute address of a link, with `.md` for a page of the docs.
 *
 * @param url - Address from the root of the site.
 * @param pages - Addresses of the pages with a Markdown version.
 * @param site - Address of the docs.
 * @returns Absolute address.
 */
function toMarkdownUrl(
  url: string,
  pages: Set<string>,
  site: undefined | URL,
): string {
  let target = new URL(url, site)
  if (pages.has(target.pathname)) {
    target.pathname =
      target.pathname === '/' ? '/index.md' : `${target.pathname}.md`
  }
  return target.href
}

/**
 * Finds the links, images and link definitions of a Markdown tree.
 *
 * @param node - Node to search.
 * @returns Nodes with an address, in the order of the tree.
 */
function findLinks(node: LinkNode): LinkNode[] {
  return (node.children ?? []).flatMap(child => [
    ...(LINK_TYPES.has(child.type) ? [child] : []),
    ...findLinks(child),
  ])
}
