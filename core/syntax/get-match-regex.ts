import type { RegExpLiteral, Node } from 'oxc-parser'

import type { AnalyzedProgram } from '../../types/syntax/analyzed-program'
import type { MatchRegex } from '../../types/syntax/match-regex'
import type { TreeIndex } from '../../types/syntax/tree-index'

import { resolveClosedExpression } from './resolve-closed-expression'
import { unwrapExpression } from '../tree/unwrap-expression'
import { getContextSlot } from '../tree/get-context-slot'

/**
 * Methods of a regular expression that run it without changing what it matches.
 */
let runMethods = new Set(['exec', 'test'])

/**
 * Methods of a string that run a regular expression argument without changing
 * what it matches.
 */
let stringMethods = new Set([
  'replaceAll',
  'matchAll',
  'replace',
  'search',
  'match',
  'split',
])

/**
 * Finds the regular expression literal that a call runs to match a string,
 * through parentheses, TypeScript wrappers and an optional chain: `re.exec(s)`,
 * or `s.match(re)` with one argument, where `re` is a regular expression
 * literal that compiles, written in the call or as the initializer that always
 * gives a name its value (see `getFixedInitializer`). A name counts only when
 * the program holds its every read and each read is a node of the runtime tree
 * (see `getClosedInitializer`) that runs the regex without changing it: the
 * receiver of a call of `exec` or `test`, or the first argument of a call of
 * `match`, `matchAll`, `replace`, `replaceAll`, `search` or `split`. `compile`
 * would change the pattern in place, and a write of a member such as `exec`, or
 * any other use, could change how the regex runs. The methods are recognized by
 * name: `exec` of a regular expression literal is the built-in one, while
 * `match` may be a method of any receiver, and so may the string methods that
 * take the regex. The built-in methods are assumed not to be patched.
 *
 * @param program - Runtime tree, scope analysis and shared scopes of the
 *   program.
 * @param node - Expression to read.
 * @returns The literal with the method of the call, or null for any other
 *   expression.
 */
export function getMatchRegex(
  program: AnalyzedProgram,
  node: Node,
): MatchRegex | null {
  let call = unwrapExpression(node)
  if (call.type === 'ChainExpression') {
    call = unwrapExpression(call.expression)
  }
  if (call.type !== 'CallExpression') {
    return null
  }
  let callee = unwrapExpression(call.callee)
  if (
    callee.type !== 'MemberExpression' ||
    callee.computed ||
    callee.property.type !== 'Identifier'
  ) {
    return null
  }
  if (callee.property.name === 'exec') {
    let literal = findRegexLiteral(program, callee.object)
    return literal && { method: 'exec', literal }
  }
  let literal =
    callee.property.name === 'match' && call.arguments.length === 1 ?
      findRegexLiteral(program, call.arguments[0]!)
    : null
  return literal && { method: 'match', literal }
}

/**
 * Tells whether a read of a regex name only runs the regex: it is, through
 * parentheses and TypeScript wrappers, the receiver of a call of `exec` or
 * `test`, or the first argument of a call of a method named `match`,
 * `matchAll`, `replace`, `replaceAll`, `search` or `split`.
 *
 * @param tree - Runtime tree of the program.
 * @param reference - Identifier that refers to the name, in the runtime tree.
 * @returns Whether the read leaves what the regex matches unchanged.
 */
function runsRegex(tree: TreeIndex, reference: Node): boolean {
  let { parent, index, key } = getContextSlot(tree, reference)
  switch (parent?.type) {
    case 'MemberExpression': {
      let call = getContextSlot(tree, parent)
      return (
        key === 'object' &&
        isNamedMember(parent, runMethods) &&
        call.key === 'callee' &&
        call.parent?.type === 'CallExpression'
      )
    }
    case 'CallExpression':
      return (
        key === 'arguments' &&
        index === 0 &&
        isNamedMember(unwrapExpression(parent.callee), stringMethods)
      )
    default:
      return false
  }
}

/**
 * Finds the regular expression literal of an expression: the expression itself,
 * or the initializer that always gives a name its value when every read of the
 * name only runs the regex, through parentheses and TypeScript wrappers.
 *
 * @param program - Runtime tree, scope analysis and shared scopes of the
 *   program.
 * @param node - Receiver of `exec` or argument of `match`.
 * @returns The literal, or null when the expression is not one or the literal
 *   does not compile.
 */
function findRegexLiteral(
  program: AnalyzedProgram,
  node: Node,
): RegExpLiteral | null {
  let current = resolveClosedExpression(program, node, runsRegex)
  return (
      current?.type === 'Literal' &&
        'regex' in current &&
        current.value !== null
    ) ?
      current
    : null
}

/**
 * Tells whether a node is a member with one of some names, not computed.
 *
 * @param node - Node to check.
 * @param names - Names of the property.
 * @returns Whether the node is `object.name` with one of the names.
 */
function isNamedMember(node: Node, names: ReadonlySet<string>): boolean {
  return (
    node.type === 'MemberExpression' &&
    !node.computed &&
    node.property.type === 'Identifier' &&
    names.has(node.property.name)
  )
}
