import type { Node } from 'oxc-parser'

import type { Replacement } from '../../types/mutator/replacement'
import type { ParsedFile } from '../../types/source/parsed-file'
import type { TreeIndex } from '../../types/syntax/tree-index'
import type { NodeSlot } from '../../types/syntax/node-slot'

import { getReplacementKind } from './get-replacement-kind'
import { parseExpression } from '../text/parse-expression'
import { needsGrouping } from '../text/needs-grouping'

/**
 * Start where an object literal, `function` or `class` would read as a block or
 * a declaration: of a statement, of the body of an arrow function, or after
 * `export default`.
 */
type Lead = 'statement' | 'export' | 'body'

/**
 * Level of a sequence, which only a slot that takes any expression accepts.
 */
const SEQUENCE_LEVEL = 0

/**
 * Level of an assignment, an arrow function and `yield`, which an argument, an
 * element, a property value or an initializer accepts.
 */
const ASSIGNMENT_LEVEL = 1

/**
 * Level of a conditional expression, which the branches of a conditional
 * accept.
 */
const CONDITIONAL_LEVEL = 2

/**
 * Level of a binary or logical expression, which the test of a conditional
 * accepts; `needsGrouping` splits it by operator.
 */
const BINARY_LEVEL = 3

/**
 * Level of a unary expression, such as `-a` or `await a`, which the operand of
 * a unary operator accepts.
 */
const UNARY_LEVEL = 4

/**
 * Level of a call, a member and every other expression that binds as tightly,
 * which the object of a member and a callee accept.
 */
const CALL_LEVEL = 5

/**
 * How tightly each type of expression binds; a type left out binds as tightly
 * as a call.
 */
let levels = new Map<string, number>([
  ['ArrowFunctionExpression', ASSIGNMENT_LEVEL],
  ['ConditionalExpression', CONDITIONAL_LEVEL],
  ['AssignmentExpression', ASSIGNMENT_LEVEL],
  ['TSSatisfiesExpression', BINARY_LEVEL],
  ['SequenceExpression', SEQUENCE_LEVEL],
  ['YieldExpression', ASSIGNMENT_LEVEL],
  ['LogicalExpression', BINARY_LEVEL],
  ['BinaryExpression', BINARY_LEVEL],
  ['UpdateExpression', UNARY_LEVEL],
  ['TSTypeAssertion', UNARY_LEVEL],
  ['AwaitExpression', UNARY_LEVEL],
  ['UnaryExpression', UNARY_LEVEL],
  ['TSAsExpression', BINARY_LEVEL],
])

/**
 * Parents whose expression slots take any expression, a sequence included.
 */
let expressionParents = new Set([
  'ParenthesizedExpression',
  'ExpressionStatement',
  'SequenceExpression',
  'DoWhileStatement',
  'ReturnStatement',
  'SwitchStatement',
  'TemplateLiteral',
  'ForInStatement',
  'ThrowStatement',
  'WhileStatement',
  'WithStatement',
  'ForStatement',
  'IfStatement',
  'SwitchCase',
])

/**
 * Parents whose expression slot takes only an expression as tight as a call.
 */
let callParents = new Set([
  'TSInstantiationExpression',
  'TaggedTemplateExpression',
  'TSNonNullExpression',
  'ClassDeclaration',
  'ClassExpression',
  'Decorator',
])

/**
 * Whitespace and comments before a token.
 */
const TRIVIA_PATTERN = /^(?:\s|\/\/[^\n\r\u{2028}\u{2029}]*|\/\*[\s\S]*?\*\/)*/u

/**
 * Word at the start of a text.
 */
const WORD_PATTERN = /^[\w$]+/u

/**
 * Types of a text that a custom mutator may write anywhere without parentheses:
 * one token, or a text already in parentheses.
 */
let atomTypes = new Set([
  'ParenthesizedExpression',
  'TemplateLiteral',
  'Identifier',
  'Literal',
])

/**
 * `await` or `yield`, which a sloppy script reads as names.
 */
const CONTEXT_WORD_PATTERN = /\b(?:await|yield)\b/u

/**
 * An `in` operator, or at least a word `in`, in a text.
 */
const IN_PATTERN = /\bin\b/u

/**
 * Wraps the text of an expression replacement in parentheses when, written as
 * it is in place of its node, it might not stay one expression in that slot, as
 * it does in the parentheses of the mutant switch. `b | c` in place of `b & c`
 * in `a ^ b & c` becomes `(b | c)`, since `a ^ b | c` reads `(a ^ b) | c`, and
 * `c, d` in place of `b` in `fn(b)` becomes `(c, d)`.
 *
 * A text with `in` in the initializer of a `for` gets parentheses, and so does
 * a text whose first tokens, past comments, would make a block or a declaration
 * of the statement, the arrow body or the `export default` that it starts (see
 * `startsWithHazard`). A slot that takes any expression, such as the test of an
 * `if`, then keeps the text. Otherwise the text is read alone, in an async
 * generator method and, when it has `await` or `yield` or does not parse there,
 * in a sloppy script, with JSX when the plain language rejects it, and gets
 * parentheses when no reading parses or any reading needs them: for a built-in
 * mutator, by `needsGrouping` as an operand of a binary or logical operator or
 * of `as`, and by how tightly it binds in any other slot (see `getSlotLevel`);
 * for a custom mutator, whose text may be anything, unless it is one token or
 * already in parentheses.
 *
 * Written in place of its node, the text then gives the mutated file that the
 * mutant switch runs, as reports and deduplication read it. A text that does
 * not change its node is kept for the no-op filter, and a node that is not an
 * expression of the runtime tree for the other checks of the replacement.
 *
 * @param replacement - Replacement a mutator returned.
 * @param file - File the node belongs to and its runtime tree.
 * @param file.parsed - Text, language and program of the file.
 * @param file.tree - Runtime tree of the file.
 * @param custom - Whether a plugin mutator, not a built-in one, returned it.
 * @returns The replacement, with its text in parentheses when its slot needs
 *   them.
 */
export function groupReplacement(
  replacement: Replacement,
  file: { parsed: ParsedFile; tree: TreeIndex },
  custom: boolean,
): Replacement {
  let { node, text } = replacement
  let { parsed, tree } = file
  let slot = tree.slots.get(node)
  if (
    !slot ||
    getReplacementKind(node) !== 'expression' ||
    text === parsed.text.slice(node.start, node.end)
  ) {
    return replacement
  }
  while (slot.parent?.type === 'ChainExpression') {
    slot = tree.slots.get(slot.parent)!
  }
  return (
      needsParentheses({ slot, text, node }, tree, {
        language: parsed.language,
        custom,
      })
    ) ?
      { ...replacement, text: `(${text})` }
    : replacement
}

/**
 * Tells whether the text of a replacement needs parentheses in the slot of its
 * node.
 *
 * @param written - Text of the replacement, its node and the slot of the node
 *   through `ChainExpression` parents.
 * @param written.text - Text of the replacement.
 * @param written.node - Node the text replaces.
 * @param written.slot - Slot of the node.
 * @param tree - Runtime tree of the file.
 * @param origin - Language of the file and whether a custom mutator wrote the
 *   text.
 * @param origin.language - Language family of the file.
 * @param origin.custom - Whether a plugin mutator wrote the text.
 * @returns Whether the text needs parentheses.
 */
function needsParentheses(
  written: { slot: NodeSlot; text: string; node: Node },
  tree: TreeIndex,
  origin: { language: ParsedFile['language']; custom: boolean },
): boolean {
  let { parent, key } = written.slot
  let { text, node } = written
  if (IN_PATTERN.test(text) && isInForInit(node, tree)) {
    return true
  }
  let lead = getLead(node, tree)
  if (lead !== null && startsWithHazard(text, lead)) {
    return true
  }
  let operator = getOperator(parent!)
  let level = getSlotLevel(parent!, key)
  if (operator === null && level === SEQUENCE_LEVEL) {
    return false
  }
  let readings = readText(text, origin.language)
  if (readings.length === 0) {
    return true
  }
  if (origin.custom) {
    return readings.some(reading => !atomTypes.has(reading.type))
  }
  return readings.some(reading =>
    operator === null ?
      isLooser(reading, { parent: parent!, level, text })
    : needsGrouping(reading, operator, {
        side: key === 'right' ? 'right' : 'left',
        language: origin.language,
      }),
  )
}

/**
 * Finds the lowest level of expression a slot takes without parentheses: any
 * expression in a statement, a template or a computed member, an expression as
 * tight as a call as the object of a member, a callee, a tag or a superclass, a
 * unary expression as an operand of a unary operator, a binary or logical one
 * as the test of a conditional, and anything but a sequence elsewhere, such as
 * in an argument, an element, a property value or an initializer.
 *
 * @param parent - Parent of the node.
 * @param key - Where the node sits in its parent, such as `test` or `callee`.
 * @returns A level from `SEQUENCE_LEVEL` to `CALL_LEVEL`.
 */
function getSlotLevel(parent: Node, key: string | null): number {
  switch (parent.type) {
    case 'ConditionalExpression':
      return key === 'test' ? BINARY_LEVEL : ASSIGNMENT_LEVEL
    case 'MemberExpression':
      return key === 'object' ? CALL_LEVEL : SEQUENCE_LEVEL
    case 'TSTypeAssertion':
    case 'AwaitExpression':
    case 'UnaryExpression':
      return UNARY_LEVEL
    case 'CallExpression':
    case 'NewExpression':
      return key === 'callee' ? CALL_LEVEL : ASSIGNMENT_LEVEL
    default:
      if (expressionParents.has(parent.type)) {
        return SEQUENCE_LEVEL
      }
      return callParents.has(parent.type) ? CALL_LEVEL : ASSIGNMENT_LEVEL
  }
}

/**
 * Reads a text as one expression in every context that may give it another
 * shape: in an async generator method, and in a sloppy script when the text has
 * `await` or `yield` or does not parse in the method, each time with JSX when
 * the plain language rejects it.
 *
 * @param text - Text of the replacement.
 * @param language - Language family of the file.
 * @returns The expressions the text reads as, without the parentheses of the
 *   parse; none when it parses in no context.
 */
function readText(text: string, language: ParsedFile['language']): Node[] {
  let [plain, jsx] =
    language === 'typescript' ?
      (['ts', 'tsx'] as const)
    : (['js', 'jsx'] as const)
  let readings: Node[] = []
  for (let context of ['method', 'script'] as const) {
    if (
      context === 'script' &&
      readings.length > 0 &&
      !CONTEXT_WORD_PATTERN.test(text)
    ) {
      break
    }
    let written =
      parseExpression(text, plain, context) ??
      parseExpression(text, jsx, context)
    if (written?.type === 'ParenthesizedExpression') {
      readings.push(written.expression)
    }
  }
  return readings
}

/**
 * Tells whether the first tokens of a text, past whitespace and comments,
 * change what a start reads as. `{` makes a statement or an arrow body a block.
 * `function`, `async function` or `class` makes a statement a declaration, and
 * so does `let [`; the first three do it after `export default` too.
 *
 * @param text - Text of the replacement.
 * @param lead - Start the text is at.
 * @returns Whether the text needs parentheses at that start.
 */
function startsWithHazard(text: string, lead: Lead): boolean {
  let rest = skipTrivia(text)
  if (rest.startsWith('{')) {
    return lead !== 'export'
  }
  let word = WORD_PATTERN.exec(rest)?.[0] ?? ''
  let next = skipTrivia(rest.slice(word.length))
  switch (word) {
    case 'function':
    case 'class':
      return lead !== 'body'
    case 'async':
      return lead !== 'body' && WORD_PATTERN.exec(next)?.[0] === 'function'
    case 'let':
      return lead === 'statement' && next.startsWith('[')
    default:
      return false
  }
}

/**
 * Finds the start a node is at: the start of a statement, of the body of an
 * arrow function or of an `export default`, when the node begins it.
 *
 * @param node - Node the text replaces.
 * @param tree - Runtime tree of the file.
 * @returns The start, or null when the node begins none.
 */
function getLead(node: Node, tree: TreeIndex): Lead | null {
  let current = node
  for (;;) {
    let { parent, key } = tree.slots.get(current)!
    if (parent?.type === 'ExpressionStatement') {
      return 'statement'
    }
    if (key === 'body' && parent?.type === 'ArrowFunctionExpression') {
      return 'body'
    }
    if (parent?.type === 'ExportDefaultDeclaration') {
      return 'export'
    }
    if (parent?.start !== node.start) {
      return null
    }
    current = parent
  }
}

/**
 * Tells whether a reading of a text binds more loosely than a slot takes. The
 * object of a member, a callee or a tag also takes no optional chain, which
 * would join the chain, and no `new`, whose arguments could move; a callee of
 * `new` takes no call or tagged template either.
 *
 * @param reading - Expression the text reads as.
 * @param slot - Parent of the node, the level of its slot and the text.
 * @param slot.parent - Parent of the node.
 * @param slot.level - Lowest level the slot takes.
 * @param slot.text - Text of the replacement.
 * @returns Whether the reading needs parentheses in the slot.
 */
function isLooser(
  reading: Node,
  slot: { level: number; parent: Node; text: string },
): boolean {
  let own = levels.get(reading.type) ?? CALL_LEVEL
  if (slot.level !== CALL_LEVEL) {
    return own < slot.level
  }
  return (
    own < CALL_LEVEL ||
    reading.type === 'ChainExpression' ||
    reading.type === 'NewExpression' ||
    (slot.parent.type === 'NewExpression' && /[(`]/u.test(slot.text))
  )
}

/**
 * Tells whether a node is in the initializer of a `for` statement and not in a
 * statement nested there, where an `in` operator would make the loop read as a
 * `for...in`, even inside an argument, so a text with `in` gets parentheses.
 *
 * @param node - Node the text replaces.
 * @param tree - Runtime tree of the file.
 * @returns Whether the node is in such an initializer.
 */
function isInForInit(node: Node, tree: TreeIndex): boolean {
  let current = node
  for (;;) {
    let { parent, key } = tree.slots.get(current)!
    if (parent?.type === 'ForStatement') {
      return key === 'init'
    }
    if (!parent || getReplacementKind(parent) === 'block') {
      return false
    }
    current = parent
  }
}

/**
 * Finds the operator of a parent whose operand `needsGrouping` judges: the
 * operator of a binary or logical expression, or `<` for `as` and `satisfies`,
 * which have the precedence of relational operators and take the expression on
 * their left.
 *
 * @param parent - Parent of the node.
 * @returns The operator, or null for another parent.
 */
function getOperator(parent: Node): string | null {
  switch (parent.type) {
    case 'TSSatisfiesExpression':
    case 'TSAsExpression':
      return '<'
    case 'LogicalExpression':
    case 'BinaryExpression':
      return parent.operator
    default:
      return null
  }
}

/**
 * Removes the whitespace and comments at the start of a text.
 *
 * @param text - Text to trim.
 * @returns The text from its first token.
 */
function skipTrivia(text: string): string {
  return text.slice(TRIVIA_PATTERN.exec(text)![0].length)
}
