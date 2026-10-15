import type { Node } from 'oxc-parser'

import type { ScopeAnalysis } from '../../types/syntax/scope-analysis'
import type { SourceCode } from '../../types/source/source-code'
import type { ParsedFile } from '../../types/source/parsed-file'
import type { TreeIndex } from '../../types/syntax/tree-index'

import { getSourcePosition } from './get-source-position'
import { removeListElement } from './remove-list-element'
import { getOperatorRange } from './get-operator-range'
import { replaceOperator } from './replace-operator'
import { findTokenStart } from './find-token-start'
import { getSlot } from '../tree/get-slot'
import { editText } from './edit-text'

/**
 * Binds the text of a parsed file, its runtime tree and its scope analysis into
 * the `sourceCode` object of the mutator context: the file fields, tree
 * navigation, name resolution, positions, token lookup and the builders of
 * replacement texts.
 *
 * @param parsed - Parsed file.
 * @param tree - Runtime tree of the file.
 * @param scopes - Scope analysis of the file.
 * @returns The source code of the file as mutators see it.
 */
export function createSourceCode(
  parsed: ParsedFile,
  tree: TreeIndex,
  scopes: ScopeAnalysis,
): SourceCode {
  let { sourceType, lineStarts, language, comments, program, text } = parsed
  return {
    getAncestors(node: Node): Node[] {
      let ancestors: Node[] = []
      let { parent } = getSlot(tree, node)
      while (parent) {
        ancestors.push(parent)
        ;({ parent } = getSlot(tree, parent))
      }
      return ancestors.toReversed()
    },
    replaceOperator: (node, operator) =>
      replaceOperator(parsed, node, operator),
    removeListElement: (node, index) => removeListElement(parsed, node, index),
    findTokenStart: (start, end) => findTokenStart(parsed, start, end),
    getBinding: identifier => scopes.bindings.get(identifier) ?? null,
    getPosition: offset => getSourcePosition(lineStarts, offset),
    getOperatorRange: node => getOperatorRange(parsed, node),
    editText: (node, edits) => editText(parsed, node, edits),
    getText: node => text.slice(node.start, node.end),
    getParent: node => getSlot(tree, node).parent,
    getSlot: node => getSlot(tree, node),
    sourceType,
    language,
    comments,
    program,
    text,
  }
}
