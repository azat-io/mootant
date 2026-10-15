import type { ExpressionStatement, Node } from 'oxc-parser'

import { describe, expect, it } from 'vitest'

import type { OperatorExpression } from '../../../types/syntax/operator-expression'
import type { ParsedFile } from '../../../types/source/parsed-file'

import { unwrapParentheses } from '../../../core/tree/unwrap-parentheses'
import { replaceOperator } from '../../../core/text/replace-operator'
import { createTestFile } from '../../helpers/create-test-file'
import { walkTree } from '../../../core/tree/walk-tree'

/**
 * Describes the structure of a tree without offsets and parentheses.
 *
 * @param node - Root of the tree.
 * @returns JSON text of the tree.
 */
function describeTree(node: Node): string {
  return JSON.stringify(
    unwrapParentheses(node),
    (key, value: unknown): unknown => {
      if (key === 'start' || key === 'end') {
        return undefined
      }
      let isNode =
        typeof value === 'object' &&
        value !== null &&
        'type' in value &&
        typeof value.type === 'string'
      return isNode ? unwrapParentheses(value as Node) : value
    },
  )
}

/**
 * Reads the expression of the first statement of a file.
 *
 * @param parsed - Parsed file whose first statement is an expression statement.
 * @returns The expression of the statement.
 */
function getExpression(parsed: ParsedFile): Node {
  let [statement] = parsed.program.body
  return (statement as ExpressionStatement).expression
}

/**
 * Verified examples of the architecture: source, file, new operator, result.
 */
const EXAMPLES = [
  { expected: 'a- -b', source: 'a+-b', operator: '-', file: 'a.ts' },
  { expected: 'a+ +b', source: 'a-+b', operator: '+', file: 'a.ts' },
  { expected: 'a- --b', source: 'a+--b', operator: '-', file: 'a.ts' },
  {
    expected: 'a/ /x/.source',
    source: 'a*/x/.source',
    operator: '/',
    file: 'a.ts',
  },
  {
    expected: 'a/* c */ /b',
    source: 'a/* c */*b',
    operator: '/',
    file: 'a.ts',
  },
  { expected: 'a< !--b', source: 'a<=!--b', operator: '<', file: 'a.ts' },
  {
    expected: 'a< <number>b',
    source: 'a!==<number>b',
    operator: '<',
    file: 'a.ts',
  },
  { expected: 'a< <b />', source: 'a!==<b />', operator: '<', file: 'a.jsx' },
  {
    expected: String.raw`b in \u0078`,
    source: String.raw`b<\u0078`,
    operator: 'in',
    file: 'a.js',
  },
  {
    expected: '(a < b) > (c)',
    source: 'a < b >= (c)',
    operator: '>',
    file: 'a.ts',
  },
  {
    expected: 'a < b > (c)',
    source: 'a < b >= (c)',
    operator: '>',
    file: 'a.js',
  },
  {
    expected: '(a || b) && c',
    source: 'a || b || c',
    operator: '&&',
    file: 'a.ts',
  },
  {
    expected: '(a ?? b) || c',
    source: 'a ?? b ?? c',
    operator: '||',
    file: 'a.ts',
  },
  {
    expected: 'a && (b && c)',
    source: 'a || b && c',
    operator: '&&',
    file: 'a.ts',
  },
  {
    expected: '(a && b) ?? c',
    source: 'a && b || c',
    operator: '??',
    file: 'a.ts',
  },
  { expected: '(-a) ** b', source: '-a * b', operator: '**', file: 'a.ts' },
  {
    expected: 'a * b ** c',
    source: 'a ** b ** c',
    operator: '*',
    file: 'a.ts',
  },
  { expected: 'a * (b * c)', source: 'a + b * c', operator: '*', file: 'a.ts' },
  {
    expected: 'a < (b < c)',
    source: 'a == b < c',
    operator: '<',
    file: 'a.ts',
  },
  { expected: 'a in b', operator: 'in', source: 'a<b', file: 'a.ts' },
  {
    expected: '(flags as number) | mask',
    source: 'flags as number ^ mask',
    operator: '|',
    file: 'a.ts',
  },
  {
    expected: '(flags satisfies number) & mask',
    source: 'flags satisfies number ^ mask',
    operator: '&',
    file: 'a.ts',
  },
  { expected: '(a) -= 1', source: '(a) += 1', operator: '-=', file: 'a.ts' },
  {
    expected: 'a /* + */ + /* - */ b',
    source: 'a /* + */ - /* - */ b',
    operator: '+',
    file: 'a.ts',
  },
  {
    expected: 'a instanceof b',
    operator: 'instanceof',
    source: 'a+b',
    file: 'a.ts',
  },
  { expected: '(a)in(b)', source: '(a)+(b)', operator: 'in', file: 'a.ts' },
  { expected: 'a ||= b', source: 'a = b', operator: '||=', file: 'a.ts' },
  { expected: '+a', operator: '+', source: '-a', file: 'a.ts' },
  { expected: '- -a', source: '+-a', operator: '-', file: 'a.ts' },
  { expected: 'typeof a', operator: 'typeof', source: '!a', file: 'a.ts' },
  { expected: 'void(a)', operator: 'void', source: '-(a)', file: 'a.ts' },
  { source: 'typeof a', expected: '! a', operator: '!', file: 'a.ts' },
  { expected: 'a--', operator: '--', source: 'a++', file: 'a.ts' },
  { expected: '--a', operator: '--', source: '++a', file: 'a.ts' },
] as const

describe('replaceOperator', () => {
  it.each(EXAMPLES)(
    'replaces the operator of $source in $file with $operator',
    ({ expected, operator, source, file }) => {
      let { parsed } = createTestFile(source, file)
      let node = getExpression(parsed) as OperatorExpression

      expect(replaceOperator(parsed, node, operator)).toBe(expected)
    },
  )

  it.each(EXAMPLES)(
    'keeps the tree of $source in $file apart from the new operator $operator',
    ({ operator, source, file }) => {
      let { parsed } = createTestFile(source, file)
      let node = getExpression(parsed) as OperatorExpression
      let replaced = createTestFile(
        `(${replaceOperator(parsed, node, operator)})`,
        file,
      ).parsed

      expect(describeTree(getExpression(replaced))).toBe(
        describeTree({ ...node, operator } as Node),
      )
    },
  )

  it('replaces the operator of a private-in expression with in', () => {
    let { parsed } = createTestFile(
      'class A { #x = 1; m(o) { return #x in o } }',
      'a.ts',
    )
    let nodes: Node[] = []
    walkTree(parsed.program, node => {
      nodes.push(node)
      return true
    })
    let node = nodes.find(
      current => current.type === 'BinaryExpression',
    ) as OperatorExpression

    expect(replaceOperator(parsed, node, 'in')).toBe('#x in o')
    expect(() => replaceOperator(parsed, node, '<')).toThrow(
      new TypeError('Operator "<" cannot replace "in".'),
    )
  })

  it.each([
    ['a + b', '+='],
    ['a + b', '!'],
    ['a && b', '++'],
    ['a += b', '+'],
    ['-a', '++'],
    ['-a', '*'],
    ['a++', '+'],
    ['a++', '+='],
  ])('rejects an invalid operator for %s: %s', (source, operator) => {
    let { parsed } = createTestFile(source, 'a.ts')
    let node = getExpression(parsed) as OperatorExpression

    expect(() => replaceOperator(parsed, node, operator)).toThrow(
      new TypeError(
        `Operator "${operator}" cannot replace "${node.operator}".`,
      ),
    )
  })
})
