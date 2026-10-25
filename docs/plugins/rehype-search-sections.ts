import type { RehypePlugin } from '@astrojs/markdown-remark'

import type { HastNode } from './wrap-elements'

/**
 * Part of a page that the docs search finds on its own.
 */
export interface SearchSection {
  /**
   * Headings the section sits under, its own heading last. Empty for the text
   * before the first heading.
   */
  headings: string[]

  /**
   * Plain text of the section without its heading.
   */
  text: string

  /**
   * Id of the section heading. Empty for the text before the first heading.
   */
  id: string
}

/**
 * Elements that continue the text around them. Any other element ends a block
 * of text, so the words of two blocks do not run together.
 */
const INLINE_ELEMENTS = new Set([
  'strong',
  'small',
  'abbr',
  'code',
  'mark',
  'span',
  'del',
  'kbd',
  'sub',
  'sup',
  'em',
  'a',
  'b',
  'i',
  's',
  'u',
])

/**
 * Splits a page into the sections that the docs search finds: the text before
 * the first heading, then every second and third level heading with the text up
 * to the next one. The sections go to the `searchSections` field of the
 * frontmatter that `render()` returns. Raw HTML is left out. Needs the ids that
 * `rehypeHeadingIds` gives headings.
 *
 * @returns Transformer that collects the sections of a page.
 */
export let rehypeSearchSections: RehypePlugin = () => (tree, file) => {
  let titles = new Map(
    file.data.astro?.headings?.map(({ slug, text }) => [slug, text]),
  )
  let current: SearchSection = { headings: [], text: '', id: '' }
  let sections = [current]
  /* Title of the last second level heading, the parent of third level ones. */
  let chapter: undefined | string

  function collect(node: HastNode): void {
    let id = node.properties?.['id']
    /* A heading of punctuation alone gets an empty id, which would link to
       the top of the page like the text before the first heading. */
    if (
      typeof id === 'string' &&
      id.length > 0 &&
      (node.tagName === 'h2' || node.tagName === 'h3')
    ) {
      let title = titles.get(id) ?? id
      if (node.tagName === 'h2') {
        chapter = title
      }
      current = {
        headings: chapter && node.tagName === 'h3' ? [chapter, title] : [title],
        text: '',
        id,
      }
      sections.push(current)
      return
    }
    if (node.type === 'text') {
      current.text += node.value
      return
    }
    let isBlock =
      node.tagName !== undefined && !INLINE_ELEMENTS.has(node.tagName)
    let children = node.children ?? []
    if (isBlock) {
      current.text += ' '
    }
    for (let child of children) {
      collect(child)
    }
    if (isBlock) {
      current.text += ' '
    }
  }

  collect(tree)

  file.data.astro ??= {}
  file.data.astro.frontmatter = {
    ...file.data.astro.frontmatter,
    searchSections: sections.map(section => ({
      ...section,
      text: section.text.replaceAll(/\s+/gu, ' ').trim(),
    })),
  }
}
