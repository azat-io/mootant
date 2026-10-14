import type { Node } from 'oxc-parser'

import { describe, expect, it } from 'vitest'

import type { ParsedFile } from '../../../types/parsed-file'
import type { NodeSlot } from '../../../types/node-slot'

import { createTestFile } from '../../helpers/create-test-file'
import { walkTree } from '../../../core/tree/walk-tree'

/**
 * Walks a tree and records every visit.
 *
 * @param root - Node to start from.
 * @param parsed - File the tree belongs to, for node texts.
 * @returns One line per visit: type, text, parent type, key and index.
 */
function recordWalk(root: Node, parsed: ParsedFile): string[] {
  let visits: string[] = []
  walkTree(root, (node: Node, slot: NodeSlot) => {
    let text = parsed.text.slice(node.start, node.end)
    visits.push(
      [node.type, text, slot.parent?.type, slot.key, slot.index].join(' | '),
    )
    return true
  })
  return visits
}

describe('walkTree', () => {
  it('visits nodes in pre-order with their raw slots', () => {
    let { parsed } = createTestFile('f(a, (b))')

    expect(recordWalk(parsed.program, parsed)).toStrictEqual([
      'Program | f(a, (b)) |  |  | ',
      'ExpressionStatement | f(a, (b)) | Program | body | 0',
      'CallExpression | f(a, (b)) | ExpressionStatement | expression | ',
      'Identifier | f | CallExpression | callee | ',
      'Identifier | a | CallExpression | arguments | 0',
      'ParenthesizedExpression | (b) | CallExpression | arguments | 1',
      'Identifier | b | ParenthesizedExpression | expression | ',
    ])
  })

  it('skips the children of a node when enter returns false', () => {
    let { parsed } = createTestFile('f(a); g(b)')
    let types: string[] = []

    walkTree(parsed.program, node => {
      types.push(node.type)
      return node.type !== 'CallExpression'
    })

    expect(types).toStrictEqual([
      'Program',
      'ExpressionStatement',
      'CallExpression',
      'ExpressionStatement',
      'CallExpression',
    ])
  })

  it('skips array holes and keeps the index of later elements', () => {
    let { parsed } = createTestFile('[a, , b]')

    expect(recordWalk(parsed.program, parsed).slice(3)).toStrictEqual([
      'Identifier | a | ArrayExpression | elements | 0',
      'Identifier | b | ArrayExpression | elements | 2',
    ])
  })

  it('starts from any node', () => {
    let { parsed } = createTestFile('a + b')
    let [statement] = parsed.program.body

    expect(recordWalk(statement!, parsed)).toStrictEqual([
      'ExpressionStatement | a + b |  |  | ',
      'BinaryExpression | a + b | ExpressionStatement | expression | ',
      'Identifier | a | BinaryExpression | left | ',
      'Identifier | b | BinaryExpression | right | ',
    ])
  })

  it('walks a binary chain of 20,000 operands without overflowing', () => {
    let { parsed } = createTestFile(
      Array.from({ length: 20_000 }, () => 'a').join(' + '),
    )
    let count = 0

    walkTree(parsed.program, () => {
      count += 1
      return true
    })

    expect(count).toBe(2 + 19_999 + 20_000)
  })

  it('visits no children of a node type without visitor keys', () => {
    let root: unknown = { value: { type: 'Identifier' }, type: 'Unknown' }
    let types: string[] = []

    walkTree(root as Node, node => {
      types.push(node.type)
      return true
    })

    expect(types).toStrictEqual(['Unknown'])
  })

  it('skips values that are not nodes', () => {
    let child = { type: 'Identifier', name: 'a', start: 0, end: 1 }
    let root: unknown = {
      elements: [null, 'a', { name: 'b' }, { type: 1 }, child],
      type: 'ArrayExpression',
    }
    let statement: unknown = {
      type: 'ExpressionStatement',
      expression: { value: 1 },
    }
    let visited: unknown[] = []

    walkTree(root as Node, node => {
      visited.push(node)
      return true
    })
    walkTree(statement as Node, node => {
      visited.push(node)
      return true
    })

    expect(visited).toStrictEqual([root, child, statement])
  })
})
