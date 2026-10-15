import type { Program, Comment, Node } from 'oxc-parser'

import type { OperatorExpression } from '../syntax/operator-expression'
import type { ListExpression } from '../syntax/list-expression'
import type { SourcePosition } from './source-position'
import type { NodeSlot } from '../syntax/node-slot'
import type { SourceRange } from './source-range'
import type { Binding } from '../syntax/binding'
import type { TextEdit } from './text-edit'

/**
 * Parsed file as mutators see it: text, comments, tree navigation, name
 * resolution, token lookup and builders of replacement texts.
 */
export interface SourceCode {
  /**
   * Returns the text of the node with its operator replaced. Inserts a space
   * where the new operator would merge with an adjacent character and
   * parenthesizes an operand whose grouping would otherwise change.
   */
  replaceOperator(node: OperatorExpression, operator: string): string

  /**
   * Returns the text of the node with one element of its comma-separated list
   * removed: an array element, an object member or a call argument.
   */
  removeListElement(node: ListExpression, index: number): string

  /**
   * Returns the text of the node with the edits applied. Edits must lie inside
   * the node and must not overlap.
   */
  editText(node: Node, edits: readonly TextEdit[]): string

  /**
   * Range of the operator token of the node.
   */
  getOperatorRange(node: OperatorExpression): SourceRange

  /**
   * First offset in the range that is not whitespace, a comment or a
   * parenthesis, or -1 when there is none.
   */
  findTokenStart(start: number, end: number): number

  /**
   * Same-file declaration that an identifier refers to or declares, or null for
   * globals, undeclared names and nodes that are not identifiers.
   */
  getBinding(identifier: Node): Binding | null

  /**
   * Module system the parser assumed.
   */
  sourceType: 'commonjs' | 'module' | 'script'

  /**
   * 1-based line and UTF-16 column of an offset.
   */
  getPosition(offset: number): SourcePosition

  /**
   * Language family of the file.
   */
  language: 'javascript' | 'typescript'

  /**
   * Nearest ancestor that is not a ParenthesizedExpression, or null for the
   * Program.
   */
  getParent(node: Node): Node | null

  /**
   * Ancestors from the Program down to the parent, without
   * ParenthesizedExpression nodes, in the order ESLint uses.
   */
  getAncestors(node: Node): Node[]

  /**
   * Property of the parent that holds the node, looking through parentheses.
   */
  getSlot(node: Node): NodeSlot

  /**
   * Comments of the file in source order, the hashbang excluded.
   */
  comments: readonly Comment[]

  /**
   * Source text of the node.
   */
  getText(node: Node): string

  /**
   * Root of the tree.
   */
  program: Program

  /**
   * Full text of the file as read from disk, byte order mark included.
   */
  text: string
}
