import type { BinaryExpression, Node } from 'oxc-parser'

import { describe, expect, it } from 'vitest'

import type { OperatorExpression } from '../../../types/syntax/operator-expression'
import type { ParsedFile } from '../../../types/source/parsed-file'

import { getOperatorRange } from '../../../core/text/get-operator-range'
import { createTestFile } from '../../helpers/create-test-file'
import { walkTree } from '../../../core/tree/walk-tree'

/**
 * Finds the first node of a type in pre-order.
 *
 * @param parsed - File to search.
 * @param type - Node type to find.
 * @returns The first node of the type.
 */
function findNode(parsed: ParsedFile, type: string): Node {
  let nodes: Node[] = []
  walkTree(parsed.program, node => {
    nodes.push(node)
    return true
  })
  let found = nodes.find(node => node.type === type)
  if (!found) {
    throw new Error(`No ${type} node found.`)
  }
  return found
}

describe('getOperatorRange', () => {
  it.each([
    ['a + b', 'BinaryExpression', '+'],
    ['a instanceof B', 'BinaryExpression', 'instanceof'],
    ['a in b', 'BinaryExpression', 'in'],
    ['a ?? b', 'LogicalExpression', '??'],
    ['a >>>= 1', 'AssignmentExpression', '>>>='],
    ['(a) += 1', 'AssignmentExpression', '+='],
    ['((a.b)) = 1', 'AssignmentExpression', '='],
    ['a /* + */ - /* - */ b', 'BinaryExpression', '-'],
    [['a // +', '  - b'].join('\n'), 'BinaryExpression', '-'],
    ['(a)+(b)', 'BinaryExpression', '+'],
    ['class A { #x = 1; m(o) { return #x in o } }', 'BinaryExpression', 'in'],
    ['-a', 'UnaryExpression', '-'],
    ['typeof a', 'UnaryExpression', 'typeof'],
    ['void (0)', 'UnaryExpression', 'void'],
    ['delete a.b', 'UnaryExpression', 'delete'],
    ['! /* c */ a', 'UnaryExpression', '!'],
    ['++a', 'UpdateExpression', '++'],
    ['-- /* c */ a', 'UpdateExpression', '--'],
    ['a++', 'UpdateExpression', '++'],
    ['a /* c */ --', 'UpdateExpression', '--'],
    ['(a)++', 'UpdateExpression', '++'],
  ])('locates the operator of %s', (source, type, operator) => {
    let { parsed } = createTestFile(source)
    let node = findNode(parsed, type) as OperatorExpression

    let { start, end } = getOperatorRange(parsed, node)

    expect(parsed.text.slice(start, end)).toBe(operator)
  })

  it('returns the range of the operator token', () => {
    let { parsed } = createTestFile('a  &&  b')

    expect(
      getOperatorRange(
        parsed,
        findNode(parsed, 'LogicalExpression') as OperatorExpression,
      ),
    ).toStrictEqual({ start: 3, end: 5 })
  })

  it('throws when the operator is not between the operands', () => {
    let { parsed } = createTestFile('a - b')
    let node = findNode(parsed, 'BinaryExpression') as BinaryExpression

    expect(() => getOperatorRange(parsed, { ...node, operator: '+' })).toThrow(
      new Error('Operator "+" not found between the operands.'),
    )
  })

  it('throws when the operands have no token between them', () => {
    let { parsed } = createTestFile('a - b')
    let node = findNode(parsed, 'BinaryExpression') as BinaryExpression

    expect(() =>
      getOperatorRange(parsed, { ...node, right: { ...node.right, start: 2 } }),
    ).toThrow(new Error('Operator "-" not found between the operands.'))
  })
})
