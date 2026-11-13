import type { Node } from 'oxc-parser'

import { isExpressionWrapper } from '../tree/is-expression-wrapper'
import { parseExpression } from '../text/parse-expression'

/**
 * Next node towards the first token of an expression, and whether the code
 * reads it as a value: false for a callee, a tag or a write target, and null
 * when it is read as its parent is, as through parentheses.
 */
interface LeftOperand {
  value: boolean | null
  node: Node
}

/**
 * Languages a branch is read in, TypeScript first: where readings differ, as in
 * `(a) < b > (c)`, it reads a call, which leaves the parentheses alone.
 */
const LANGUAGES = ['ts', 'tsx', 'jsx'] as const

/**
 * Pattern of a regular expression literal that oxc misreads right after `(`.
 */
const COMMENT_PATTERN = /^\s*<!--/u

/**
 * Writes an expression as a branch of the mutant switch, in parentheses, which
 * keep a sequence whole. The oxc parser, which Vite 8 reads modules with, takes
 * a regular expression literal whose pattern starts with `<!--` right after a
 * `(` that opens an expression for an HTML comment, white space and comments
 * between them aside, which a module does not allow, so the module would not
 * load. The nearest `(` before such a literal, of the branch or of the text, is
 * followed by `0, ` when its parentheses hold a value, which keeps it: `(0,
 * /<!--/g)`. Parentheses around a callee, a tag or a write target stay as they
 * are, since `0, ` would lose the `this` of the call or the target. Only the
 * start of a text lands somewhere new in the switched code; every other `(`
 * stays after the code the source or the mutator put before it.
 *
 * @param text - Replacement or original text of the branch.
 * @returns Text to write as the branch.
 */
export function renderBranch(text: string): string {
  let branch = `(${text})`
  if (!text.includes('<!--')) {
    return branch
  }
  for (let lang of LANGUAGES) {
    let root = parseExpression(text, lang)
    if (root?.type === 'ParenthesizedExpression') {
      let opening = findOpening(root)
      if (opening === null) {
        return branch
      }
      let index = opening - root.start + 1
      return `${branch.slice(0, index)}0, ${branch.slice(index)}`
    }
  }
  return branch
}

/**
 * Finds the operand of an expression that its first token belongs to. An
 * expression wrapper and an optional chain pass their expression on as they are
 * read; `<T>x` starts with a token of its own, which `findOpening` sees as an
 * operand that starts after its parent.
 *
 * @param node - Expression on the way to the first token.
 * @returns The operand and how it is read, or null when the expression starts
 *   with a token of its own.
 */
function getLeftOperand(node: Node): LeftOperand | null {
  if (isExpressionWrapper(node) || node.type === 'ChainExpression') {
    return { node: node.expression, value: null }
  }
  switch (node.type) {
    case 'TaggedTemplateExpression':
      return { node: node.tag, value: false }
    case 'ConditionalExpression':
      return { node: node.test, value: true }
    case 'AssignmentExpression':
      return { node: node.left, value: false }
    case 'SequenceExpression':
      return { node: node.expressions[0]!, value: true }
    case 'LogicalExpression':
    case 'BinaryExpression':
      return { node: node.left, value: true }
    case 'UpdateExpression':
      return node.prefix ? null : { node: node.argument, value: false }
    case 'MemberExpression':
      return { node: node.object, value: true }
    case 'CallExpression':
      return { node: node.callee, value: false }
    default:
      return null
  }
}

/**
 * Follows the first tokens of a branch down to its first literal and finds the
 * nearest `(` before it, when that literal is a regular expression oxc misreads
 * there and the parentheses hold a value. The parser keeps no node for
 * parentheses around a write target; an operand that starts after its parent
 * stands for them.
 *
 * @param root - Parentheses of the branch.
 * @returns Offset of that `(` in the parsed text, or null.
 */
function findOpening(root: Node): number | null {
  let opening = { start: root.start, value: true }
  let value = true
  let current: Node = root
  let left = getLeftOperand(current)
  while (left !== null) {
    let { node } = left
    value = left.value ?? value
    if (node.type === 'ParenthesizedExpression') {
      opening = { start: node.start, value }
    } else if (
      current.type !== 'ParenthesizedExpression' &&
      node.start !== current.start
    ) {
      opening = { start: node.start, value: false }
    }
    current = node
    left = getLeftOperand(current)
  }
  let misread =
    current.type === 'Literal' &&
    'regex' in current &&
    COMMENT_PATTERN.test(current.regex.pattern)
  return misread && opening.value ? opening.start : null
}
