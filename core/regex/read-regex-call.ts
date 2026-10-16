import type { Node } from 'oxc-parser'

import type { MutatorContext } from '../../types/mutator/mutator-context'
import type { RegexCall } from '../../types/regex/regex-call'

/**
 * Reads a call of the global `RegExp`, with or without `new`, whose pattern
 * argument a regex mutator can read: a string literal, a template literal, or a
 * `String.raw` template without expressions. The flags must be absent, a string
 * literal or a template literal without expressions; the call has no other
 * argument and no spread, and no binding of the file shadows `RegExp` or
 * `String`.
 *
 * @param node - Node of the runtime tree.
 * @param context - Mutator context of the file.
 * @returns The call, or null for anything else.
 */
export function readRegexCall(
  node: Node,
  context: Pick<MutatorContext, 'sourceCode' | 'syntax'>,
): RegexCall | null {
  if (node.type !== 'CallExpression' && node.type !== 'NewExpression') {
    return null
  }
  let { syntax } = context
  let callee = syntax.unwrapExpression(node.callee)
  let { arguments: parts } = node
  if (
    !isGlobal(callee, 'RegExp', context) ||
    parts.length === 0 ||
    parts.length > 2 ||
    parts.some(part => part.type === 'SpreadElement')
  ) {
    return null
  }
  let pattern = syntax.unwrapExpression(parts[0]!)
  let flagsNode = parts[1] ? syntax.unwrapExpression(parts[1]) : null
  let flags = flagsNode ? readStaticString(flagsNode) : ''
  if (flags === null || !isPatternArgument(pattern, context)) {
    return null
  }
  return { call: node, flagsNode, pattern, flags }
}

/**
 * Tells whether an argument is a string literal, a template literal, or a
 * `String.raw` template without expressions.
 *
 * @param node - First argument, unwrapped.
 * @param context - Mutator context of the file.
 * @returns Whether a regex mutator reads the argument.
 */
function isPatternArgument(
  node: Node,
  context: Pick<MutatorContext, 'sourceCode' | 'syntax'>,
): boolean {
  if (node.type === 'TemplateLiteral') {
    return true
  }
  if (node.type === 'TaggedTemplateExpression') {
    let tag = context.syntax.unwrapExpression(node.tag)
    return (
      node.quasi.expressions.length === 0 &&
      tag.type === 'MemberExpression' &&
      !tag.computed &&
      tag.property.name === 'raw' &&
      isGlobal(context.syntax.unwrapExpression(tag.object), 'String', context)
    )
  }
  return readStaticString(node) !== null
}

/**
 * Reads the value of a string literal or of a template literal without
 * expressions. An untagged template always has a value: an invalid escape in it
 * is a syntax error.
 *
 * @param node - Expression, unwrapped.
 * @returns The value, or null for anything else.
 */
function readStaticString(node: Node): string | null {
  if (node.type === 'Literal') {
    return typeof node.value === 'string' ? node.value : null
  }
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis[0]!.value.cooked!
  }
  return null
}

/**
 * Tells whether a node is an identifier of a global that no binding of the file
 * shadows.
 *
 * @param node - Expression, unwrapped.
 * @param name - Global the identifier must name, such as `RegExp`.
 * @param context - Mutator context of the file.
 * @returns Whether the node refers to the global.
 */
function isGlobal(
  node: Node,
  name: string,
  context: Pick<MutatorContext, 'sourceCode'>,
): boolean {
  return (
    node.type === 'Identifier' &&
    node.name === name &&
    context.sourceCode.getBinding(node) === null
  )
}
