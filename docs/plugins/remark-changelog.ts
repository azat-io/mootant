import type { RemarkPlugin } from '@astrojs/markdown-remark'

import { fileURLToPath } from 'node:url'

import type { MarkdownNode } from './markdown-node'

import { getText } from './get-text'

/**
 * The release file is also used on GitHub, so only its docs rendering changes.
 */
const CHANGELOG_PATH = fileURLToPath(
  new URL('../../changelog.md', import.meta.url),
)

/**
 * Matches an emoji inside a grapheme, including flags and key sequences.
 * Ordinary digits, hashes and asterisks are not emoji on their own.
 */
const EMOJI_PATTERN =
  /[\p{Extended_Pictographic}\p{Regional_Indicator}\u{20E3}]/u

/**
 * The release generator marks breaking changes at the start of list items.
 */
const BREAKING_PATTERN = /^⚠[\u{FE0E}\u{FE0F}]?\s*/u

let segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' })

/**
 * Renders the root changelog without decorative emoji, keeps breaking changes
 * explicit and gives each release's sections stable anchors. Runs before
 * section grouping, heading collection and search indexing.
 *
 * @returns Transformer scoped to the root changelog.
 */
export let remarkChangelog: RemarkPlugin = () => (tree, file) => {
  if (file.path !== CHANGELOG_PATH) {
    return
  }
  let root = tree as MarkdownNode
  cleanText(root)
  if (!root.children) {
    return
  }
  let heading = root.children.findIndex(
    node => node.type === 'heading' && node.depth === 1,
  )
  if (heading !== -1) {
    root.children.splice(heading + 1, 0, {
      children: [
        {
          value: 'What’s new in Mootant, release by release.',
          type: 'text',
        },
      ],
      type: 'paragraph',
    })
  }
  let version = ''
  let ids = new Map<string, number>()
  for (let node of root.children) {
    if (node.type !== 'heading' || node.depth === 1) {
      continue
    }
    let title = getText(node)
    if (title === 'Breaking Changes' && node.depth === 4) {
      node.depth = 3
    }
    let slug = title
      .toLowerCase()
      .replaceAll(/[^\p{Letter}\p{Number}\-._]+/gu, '-')
      .replaceAll(/^-+|-+$/gu, '')
    if (node.depth === 2) {
      version = slug
    } else if (version) {
      slug = `${version}-${slug}`
    }
    let count = ids.get(slug) ?? 0
    ids.set(slug, count + 1)
    node.data = {
      ...node.data,
      hProperties: {
        ...node.data?.hProperties,
        id: count ? `${slug}-${count}` : slug,
      },
    }
  }
}

/**
 * Removes whole emoji graphemes from visible text, preserving code and link
 * destinations. Grapheme segmentation keeps joiners, skin tones and variation
 * selectors from being left behind after removing the visible character.
 *
 * @param node - Markdown node to clean.
 * @param inList - Whether the node belongs to a list item.
 */
function cleanText(node: MarkdownNode, inList = false): void {
  if (node.type === 'text' && node.value) {
    let { value } = node
    if (inList) {
      value = value.replace(BREAKING_PATTERN, 'Breaking change: ')
    }
    let graphemes = [...segmenter.segment(value)]
    let leadingEmoji = EMOJI_PATTERN.test(graphemes[0]?.segment ?? '')
    node.value = graphemes
      .filter(({ segment }) => !EMOJI_PATTERN.test(segment))
      .map(({ segment }) => segment)
      .join('')
    if (leadingEmoji) {
      node.value = node.value.trimStart()
    }
    return
  }
  if (!node.children) {
    return
  }
  for (let child of node.children) {
    cleanText(child, inList || node.type === 'listItem')
  }
}
