import type { RehypePlugin } from '@astrojs/markdown-remark'

import type { ChangedRange } from '../utils/get-changed-range'
import type { HastNode } from './wrap-elements'

import { getChangedRange } from '../utils/get-changed-range'
import { isMutantColumn } from './is-mutant-column'
import { getTextNode } from './get-text-node'
import { getElements } from './get-elements'
import { getTitles } from './get-titles'
import { getText } from './get-text'

/**
 * Version of the code that a mark belongs to.
 */
type Side = 'before' | 'after'

/**
 * Elements around the changed text of each version.
 */
let tagNames: Record<Side, string> = { before: 'del', after: 'ins' }

/**
 * Marks what a mutant changes, as the reports of Mootant do: in every pair of
 * inline code joined by an arrow, such as `a + b` → `a - b`, in every row of a
 * table with Code and Mutant columns and in the `-` and `+` lines of a code
 * block. The changed text goes into `del` and `ins`, so only colors separate it
 * from the code around it. A table of skipped changes stays unmarked, since
 * these changes never become mutants.
 *
 * @returns Transformer that marks the changes of a page.
 */
export let rehypeMutantChanges: RehypePlugin = () => tree => {
  markChanges(tree)
}

/**
 * Marks the rows of a table that has Code and Mutant columns. When a row has
 * several mutants, its code marks what the first one changes.
 *
 * @param table - Table to mark.
 * @param titles - Titles of its columns.
 */
function markTable(table: HastNode, titles: string[]): void {
  let codeColumn = titles.indexOf('Code')
  let mutantColumn = titles.findIndex(title => isMutantColumn(title))
  if (codeColumn === -1 || mutantColumn === -1) {
    return
  }
  table.properties = { ...table.properties, className: ['changes'] }
  let [, body] = getElements(table)
  for (let row of getElements(body)) {
    let cells = getElements(row)
    let code = getElements(cells[codeColumn]).find(child => isPlainCode(child))
    if (!code) {
      continue
    }
    let original = getText(code)
    let mutants = getElements(cells[mutantColumn]).filter(child =>
      isPlainCode(child),
    )
    for (let [index, mutant] of mutants.entries()) {
      let range = getChangedRange(original, getText(mutant))
      markCode(mutant, range, 'after')
      if (index === 0) {
        markCode(code, range, 'before')
      }
    }
  }
}

/**
 * Marks the changes under a node.
 *
 * @param node - Node to search.
 */
function markChanges(node: HastNode): void {
  if (node.tagName === 'pre') {
    markCodeBlock(node)
    return
  }
  if (node.tagName === 'table') {
    let titles = getTitles(node)
    if (titles.includes('Reason')) {
      return
    }
    markTable(node, titles)
  }
  let children = node.children ?? []
  for (let [index, child] of children.entries()) {
    let arrow = children[index + 1]
    let after = children[index + 2]
    if (
      after &&
      arrow?.type === 'text' &&
      arrow.value?.trim() === '→' &&
      isPlainCode(child) &&
      isPlainCode(after)
    ) {
      let range = getChangedRange(getText(child), getText(after))
      markCode(child, range, 'before')
      markCode(after, range, 'after')
    }
    markChanges(child)
  }
}

/**
 * Wraps the changed part of a highlighted line in an element, cutting the
 * tokens that the part starts or ends in.
 *
 * @param line - Line of a code block with one element per token.
 * @param range - What the mutant changes in the line.
 * @param side - Version of the code that the line shows.
 */
function markLine(line: HastNode, range: ChangedRange, side: Side): void {
  let start = range.prefix.length
  let end = start + range[side].length
  let offset = 0
  line.children = (line.children ?? []).flatMap(token => {
    let text = getText(token)
    let from = Math.max(start - offset, 0)
    let to = Math.min(end - offset, text.length)
    offset += text.length
    if (from >= to) {
      return [token]
    }
    return [
      ...(from > 0 ? [cutToken(token, text.slice(0, from))] : []),
      getMark(side, [cutToken(token, text.slice(from, to))]),
      ...(to < text.length ? [cutToken(token, text.slice(to))] : []),
    ]
  })
}

/**
 * Marks each `-` line of a code block and the `+` line right after it.
 *
 * @param block - Element of the code block.
 */
function markCodeBlock(block: HastNode): void {
  let lines = getElements(getElements(block)[0])
  for (let [index, line] of lines.entries()) {
    let next = lines[index + 1]
    if (next && hasClass(line, 'remove') && hasClass(next, 'add')) {
      let range = getChangedRange(getText(line), getText(next))
      markLine(line, range, 'before')
      markLine(next, range, 'after')
    }
  }
}

/**
 * Replaces the text of inline code with its parts, the changed one marked.
 *
 * @param code - Inline code to change.
 * @param range - What the mutant changes in the code.
 * @param side - Version of the code that the element shows.
 */
function markCode(code: HastNode, range: ChangedRange, side: Side): void {
  let changed = range[side]
  code.children = [
    ...(range.prefix ? [getTextNode(range.prefix)] : []),
    ...(changed ? [getMark(side, [getTextNode(changed)])] : []),
    ...(range.suffix ? [getTextNode(range.suffix)] : []),
  ]
}

/**
 * Tells whether an element has a class.
 *
 * @param node - Element to check.
 * @param name - Class to look for.
 * @returns True when the element has the class.
 */
function hasClass(node: HastNode, name: string): boolean {
  let className = node.properties?.['class'] ?? node.properties?.['className']
  return (Array.isArray(className) ? className.join(' ') : String(className))
    .split(' ')
    .includes(name)
}

/**
 * Builds the element around the changed text.
 *
 * @param side - Version of the code that the text belongs to.
 * @param children - Changed text.
 * @returns Element `del` for the original code, `ins` for the mutant.
 */
function getMark(side: Side, children: HastNode[]): HastNode {
  return {
    tagName: tagNames[side],
    type: 'element',
    properties: {},
    children,
  }
}

/**
 * Tells whether a node is inline code with nothing but text in it.
 *
 * @param node - Node to check.
 * @returns True for inline code that can be marked.
 */
function isPlainCode(node: HastNode): boolean {
  let [first, second] = node.children ?? []
  return node.tagName === 'code' && first?.type === 'text' && !second
}

/**
 * Copies a token of a highlighted line with part of its text.
 *
 * @param token - Token to copy, whose color the copy keeps.
 * @param value - Part of the text of the token.
 * @returns Element with the same color and the given text.
 */
function cutToken(token: HastNode, value: string): HastNode {
  return { ...token, children: [getTextNode(value)] }
}
