import type { MemberExpression, Node } from 'oxc-parser'
import type { AST } from '@eslint-community/regexpp'

import type { AnalyzedProgram } from '../../types/syntax/analyzed-program'
import type { TreeIndex } from '../../types/syntax/tree-index'

import { parseRegexPattern } from '../regex/parse-regex-pattern'
import { getClosedInitializer } from './get-closed-initializer'
import { isMandatoryGroup } from '../regex/is-mandatory-group'
import { unwrapExpression } from '../tree/unwrap-expression'
import { getContextSlot } from '../tree/get-context-slot'
import { hasNamedGroup } from '../regex/has-named-group'
import { getMatchRegex } from './get-match-regex'
import { isWriteTarget } from './is-write-target'
import { isTruthTest } from './is-truth-test'

/**
 * Finds why the object or callee that an optional link guards is never nullish
 * once the chain reaches the link, as the regular expression of a match tells
 * (catalog 4.13, N5). The node is, through parentheses and TypeScript wrappers,
 * a member of the same chain:
 *
 * - `match.groups`, also `match?.groups`, when the regex has a named group (see
 *   `hasNamedGroup`), since a match then always has a `groups` object;
 * - `match.groups.name` or `match.groups['name']`, also after `?.`, when the
 *   group `name` takes part in every match (see `isMandatoryGroup`), since its
 *   value is then a string.
 *
 * Here `match` is a match call (see `getMatchRegex`) or a name that always
 * holds one (see `getFixedInitializer`): `exec`, or `match` of a regex without
 * the `g` flag, whose result has no groups. A name counts only when the program
 * holds its every read and each read is a node of the runtime tree (see
 * `getClosedInitializer`) that only tests the match or reads its groups, since
 * the match is an object that any code reaching it may change. When the call
 * finds no match, reading `groups` throws or an earlier `?.` of the chain ends
 * it, with `.` as with `?.`. Parentheses around a chain end it, so they are not
 * looked through: `(match?.groups)?.name` gives undefined where `.name` throws.
 * The built-in methods are assumed not to be patched, and `match` is recognized
 * by name.
 *
 * @param program - Runtime tree, scope analysis and shared scopes of the
 *   program.
 * @param node - Object or callee that an optional link guards.
 * @returns Why the node is never nullish there, worded as a clause such as "the
 *   regex has a named group, so groups is an object whenever the match is", or
 *   null when nothing tells it.
 */
export function getNamedGroupsFact(
  program: AnalyzedProgram,
  node: Node,
): string | null {
  let receiver = unwrapExpression(node)
  if (receiver.type !== 'MemberExpression') {
    return null
  }
  if (isGroupsMember(receiver)) {
    let pattern = readMatchPattern(program, receiver.object)
    if (pattern && hasNamedGroup(pattern)) {
      return 'the regex has a named group, so groups is an object whenever the match is'
    }
  }
  let name = readGroupName(receiver)
  let groups = unwrapExpression(receiver.object)
  if (
    name === null ||
    groups.type !== 'MemberExpression' ||
    !isGroupsMember(groups)
  ) {
    return null
  }
  let pattern = readMatchPattern(program, groups.object)
  return pattern && isMandatoryGroup(pattern, name) ?
      `the named group \`${name}\` takes part in every match, so its value is a string`
    : null
}

/**
 * Parses the pattern of the match that an expression holds: a match call, or a
 * name that always holds one and whose every read only tests the match or reads
 * its groups, through parentheses and TypeScript wrappers. A `match` call of a
 * regex with the `g` flag gives an array of strings without groups, so it has
 * none.
 *
 * @param program - Runtime tree, scope analysis and shared scopes of the
 *   program.
 * @param node - Object of the `groups` member.
 * @returns The pattern tree of the regex, or null when the expression is not a
 *   match whose groups the regex tells, or regexpp cannot parse the pattern.
 */
function readMatchPattern(
  program: AnalyzedProgram,
  node: Node,
): AST.Pattern | null {
  let current = unwrapExpression(node)
  if (current.type === 'Identifier') {
    let binding = program.scopes.bindings.get(current)
    let initializer =
      binding && getClosedInitializer(program, binding, readsGroups)
    if (!initializer) {
      return null
    }
    current = initializer
  }
  let match = getMatchRegex(program, current)
  if (!match) {
    return null
  }
  let { pattern, flags } = match.literal.regex
  return match.method === 'match' && flags.includes('g') ?
      null
    : parseRegexPattern(pattern, flags)
}

/**
 * Tells whether a read of a match name only tests the match or reads its
 * groups, through parentheses and TypeScript wrappers: it tests the truth of
 * the match (see `isTruthTest`) or is the object of a `groups` member that is
 * itself tested or is the object of a member that is neither written nor
 * deleted. When every read of the name is one, no code writes or deletes the
 * groups or a group, and no other code reaches the match or its groups.
 *
 * @param tree - Runtime tree of the program.
 * @param reference - Identifier that refers to the name, in the runtime tree.
 * @returns Whether the read tests the match, tests its groups or reads a member
 *   of them without writing or deleting it.
 */
function readsGroups(tree: TreeIndex, reference: Node): boolean {
  if (isTruthTest(tree, reference)) {
    return true
  }
  let { parent, key } = getContextSlot(tree, reference)
  if (
    key !== 'object' ||
    parent?.type !== 'MemberExpression' ||
    !isGroupsMember(parent)
  ) {
    return false
  }
  let member = getContextSlot(tree, parent)
  if (member.key === 'object' && member.parent?.type === 'MemberExpression') {
    return !isWritten(tree, member.parent)
  }
  return isTruthTest(tree, getChainEnd(tree, parent))
}

/**
 * Reads the name of a group that a member of `groups` reads: a property name,
 * or a computed string literal through parentheses and TypeScript wrappers.
 *
 * @param member - Member expression.
 * @returns The name, or null for a key that is not known.
 */
function readGroupName(member: MemberExpression): string | null {
  if (!member.computed) {
    return member.property.type === 'Identifier' ? member.property.name : null
  }
  let key = unwrapExpression(member.property)
  return key.type === 'Literal' && typeof key.value === 'string' ?
      key.value
    : null
}

/**
 * Tells whether code writes or deletes a member: it is, through parentheses,
 * TypeScript wrappers and the optional chain it ends, a write target (see
 * `isWriteTarget`) or the operand of `delete`.
 *
 * @param tree - Runtime tree of the program.
 * @param node - Member of the runtime tree.
 * @returns Whether the member is written or deleted.
 */
function isWritten(tree: TreeIndex, node: Node): boolean {
  let slot = getContextSlot(tree, getChainEnd(tree, node))
  return (
    isWriteTarget(tree, slot) ||
    (slot.parent?.type === 'UnaryExpression' &&
      slot.parent.operator === 'delete')
  )
}

/**
 * Tells whether a member reads `groups` by name, not computed.
 *
 * @param member - Member expression.
 * @returns Whether the member is `object.groups`.
 */
function isGroupsMember(member: MemberExpression): boolean {
  return (
    !member.computed &&
    member.property.type === 'Identifier' &&
    member.property.name === 'groups'
  )
}

/**
 * Finds the optional chain that a node ends, through parentheses and TypeScript
 * wrappers, or the node itself.
 *
 * @param tree - Runtime tree of the program.
 * @param node - Member of the runtime tree.
 * @returns The ChainExpression whose expression the node is, or the node.
 */
function getChainEnd(tree: TreeIndex, node: Node): Node {
  let { parent } = getContextSlot(tree, node)
  return parent?.type === 'ChainExpression' ? parent : node
}
