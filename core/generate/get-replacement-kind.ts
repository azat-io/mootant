import type { Node } from 'oxc-parser'

/**
 * Statements that the mutant switch wraps in an `if`/`else`.
 */
let blockTypes = new Set<string>([
  'ExpressionStatement',
  'ContinueStatement',
  'DebuggerStatement',
  'DoWhileStatement',
  'LabeledStatement',
  'ReturnStatement',
  'SwitchStatement',
  'ForInStatement',
  'ForOfStatement',
  'BlockStatement',
  'BreakStatement',
  'EmptyStatement',
  'ThrowStatement',
  'WhileStatement',
  'WithStatement',
  'ForStatement',
  'TryStatement',
  'IfStatement',
])

/**
 * Expressions that the mutant switch wraps in a conditional expression.
 */
let expressionTypes = new Set<string>([
  'TSInstantiationExpression',
  'TaggedTemplateExpression',
  'ArrowFunctionExpression',
  'ConditionalExpression',
  'TSSatisfiesExpression',
  'AssignmentExpression',
  'TSNonNullExpression',
  'SequenceExpression',
  'FunctionExpression',
  'LogicalExpression',
  'ImportExpression',
  'MemberExpression',
  'BinaryExpression',
  'ObjectExpression',
  'UpdateExpression',
  'ChainExpression',
  'ArrayExpression',
  'AwaitExpression',
  'ClassExpression',
  'TemplateLiteral',
  'TSTypeAssertion',
  'UnaryExpression',
  'YieldExpression',
  'CallExpression',
  'ThisExpression',
  'TSAsExpression',
  'NewExpression',
  'MetaProperty',
  'JSXFragment',
  'Identifier',
  'JSXElement',
  'Literal',
])

/**
 * Derives how a mutant that replaces a node will be switched on: statements are
 * wrapped in an `if`/`else`, expressions in a conditional expression.
 * Declarations, parentheses, patterns, class members, properties and other
 * nodes cannot be wrapped.
 *
 * @param node - Node a replacement targets.
 * @returns `block` for a statement, `expression` for an expression, or null
 *   when the node cannot be replaced.
 */
export function getReplacementKind(node: Node): 'expression' | 'block' | null {
  if (blockTypes.has(node.type)) {
    return 'block'
  }
  if (expressionTypes.has(node.type)) {
    return 'expression'
  }
  return null
}
