import type { ForOfStatement, Node } from 'oxc-parser'

import type { AnalyzedProgram } from '../../types/syntax/analyzed-program'
import type { ScopeAnalysis } from '../../types/syntax/scope-analysis'
import type { TreeIndex } from '../../types/syntax/tree-index'
import type { CountMap } from '../../types/syntax/count-map'
import type { Binding } from '../../types/syntax/binding'

import { getFixedInitializer } from './get-fixed-initializer'
import { unwrapExpression } from '../tree/unwrap-expression'
import { getCollectionClass } from './get-collection-class'
import { getContextSlot } from '../tree/get-context-slot'

/**
 * Reads a count map (catalog 3.4, N1d): a name that always holds a Map no other
 * code reaches (see `getCollectionClass`), whose initializer is `new Map()`
 * without arguments, so it starts empty, and whose every `set` call has exactly
 * two arguments, neither a spread, so it stores one value under one key. The
 * map must store at least one value. A component has no count map: another of
 * its script blocks may declare `Map`.
 *
 * @param program - Runtime tree, scope analysis and shared scopes of the
 *   program.
 * @param binding - Binding to read.
 * @returns The values its `set` calls store and the value names of the
 *   `for...of` loops over it, or null when the binding is not a count map.
 */
export function getCountMap(
  program: AnalyzedProgram,
  binding: Binding,
): CountMap | null {
  let { shared, scopes, tree } = program
  let initializer = getFixedInitializer(scopes, shared, binding)
  let start = initializer && unwrapExpression(initializer)
  if (
    start?.type !== 'NewExpression' ||
    start.arguments.length > 0 ||
    getCollectionClass(program, binding.identifier) !== 'Map'
  ) {
    return null
  }
  let countMap: CountMap = { entries: [], values: [] }
  for (let reference of binding.references) {
    let { parent } = getContextSlot(tree, reference)
    if (parent?.type === 'ForOfStatement') {
      countMap.entries.push(...getEntryNames(scopes, parent))
    }
    let values = getStoredValues(tree, reference)
    if (values) {
      if (
        values.length !== 2 ||
        values.some(value => value.type === 'SpreadElement')
      ) {
        return null
      }
      countMap.values.push(values[1]!)
    }
  }
  return countMap.values.length > 0 ? countMap : null
}

/**
 * Finds the value name of a `for...of` loop over a map: the second element of
 * the array pattern that a `let` or `const` head declares as a whole, as in
 * `for (const [key, value] of map)`, when nothing writes it.
 *
 * @param scopes - Scope analysis of the program.
 * @param loop - Loop over the map.
 * @returns The binding of the value name, or none.
 */
function getEntryNames(scopes: ScopeAnalysis, loop: ForOfStatement): Binding[] {
  let { left } = loop
  if (left.type !== 'VariableDeclaration' || left.kind === 'var') {
    return []
  }
  let [declarator] = left.declarations
  if (declarator!.id.type !== 'ArrayPattern') {
    return []
  }
  let [, value] = declarator!.id.elements
  let binding =
    value?.type === 'Identifier' ? scopes.bindings.get(value) : undefined
  return binding?.writes.length === 0 ? [binding] : []
}

/**
 * Finds the arguments of a `set` call that a reference of a map makes, through
 * parentheses and TypeScript wrappers.
 *
 * @param tree - Runtime tree of the program.
 * @param reference - Identifier that refers to the map, in the runtime tree.
 * @returns The arguments of the call, or null for any other use of the map.
 */
function getStoredValues(tree: TreeIndex, reference: Node): Node[] | null {
  let member = getContextSlot(tree, reference).parent
  let call =
    (
      member?.type === 'MemberExpression' &&
      member.property.type === 'Identifier' &&
      member.property.name === 'set'
    ) ?
      getContextSlot(tree, member).parent
    : null
  return call?.type === 'CallExpression' ? call.arguments : null
}
