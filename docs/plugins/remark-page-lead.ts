import type { RemarkPlugin } from '@astrojs/markdown-remark'

import type { MarkdownNode } from './markdown-node'

/**
 * Start of the sentence that tells how tests catch the mutants of a mutator.
 */
const TESTS_CATCH_PATTERN = /Tests\s+catch/u

/**
 * Marks the lead of a page, which the docs show like the leads of the home
 * page. The lead of a mutator page is its sentence on how tests catch the
 * mutants, moved out of the first paragraph into one of its own. The lead of
 * any other page is its first paragraph.
 *
 * @returns Transformer that marks the lead of a page.
 */
export let remarkPageLead: RemarkPlugin = () => tree => {
  let children = (tree as MarkdownNode).children ?? []
  let index = children.findIndex(({ type }) => type === 'paragraph')
  let heading = children.findIndex(({ type }) => type === 'heading')
  let paragraph = children[index]
  if (!paragraph || (heading !== -1 && heading < index)) {
    return
  }
  let sentence = splitAtTestsCatch(paragraph)
  if (sentence) {
    children.splice(index + 1, 0, sentence)
    markLead(sentence)
  } else {
    markLead(paragraph)
  }
}

/**
 * Moves the sentence on how tests catch mutants out of a paragraph.
 *
 * @param paragraph - Paragraph to split.
 * @returns New paragraph with the sentence and the text after it, if any.
 */
function splitAtTestsCatch(paragraph: MarkdownNode): MarkdownNode | undefined {
  let nodes = paragraph.children ?? []
  let index = nodes.findIndex(
    ({ value, type }) => type === 'text' && TESTS_CATCH_PATTERN.test(value!),
  )
  let node = nodes[index]
  if (!node) {
    return undefined
  }
  let text = node.value!
  let start = text.search(TESTS_CATCH_PATTERN)
  if (start === 0 && index === 0) {
    return undefined
  }
  node.value = text.slice(0, start).trimEnd()
  paragraph.children = nodes.slice(0, index + 1)
  return {
    children: [
      { value: text.slice(start), type: 'text' },
      ...nodes.slice(index + 1),
    ],
    type: 'paragraph',
  }
}

/**
 * Gives a paragraph the class of a lead.
 *
 * @param paragraph - Paragraph to mark.
 */
function markLead(paragraph: MarkdownNode): void {
  paragraph.data = { hProperties: { className: ['lead'] } }
}
