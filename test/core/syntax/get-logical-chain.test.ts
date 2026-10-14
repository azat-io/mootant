import { describe, expect, it } from 'vitest'

import { getLogicalChain } from '../../../core/syntax/get-logical-chain'
import { createTestFile } from '../../helpers/create-test-file'

describe('getLogicalChain', () => {
  it.each([
    { operands: ['a', 'b'], source: 'a && b' },
    { operands: ['a', 'b', 'c'], source: 'a && b && c' },
    { operands: ['a', 'b', 'c'], source: 'a && (b && c)' },
    { source: '(a && b) && ((c && d))', operands: ['a', 'b', 'c', 'd'] },
    { operands: ['a', 'b && c'], source: 'a || b && c' },
    { operands: ['(a || b)', 'c'], source: '(a || b) && c' },
    { operands: ['a', 'b', 'c'], source: 'a ?? (b ?? c)' },
    { operands: ['a', '(b as T)'], source: 'a || (b as T)' },
  ])('gives $operands for $source', ({ operands, source }) => {
    let { sourceCode, find } = createTestFile(source)

    let chain = getLogicalChain(find('LogicalExpression', source))

    expect(chain.map(operand => sourceCode.getText(operand))).toStrictEqual(
      operands,
    )
  })

  it('collects a long chain without recursion', () => {
    let source = Array.from({ length: 20_000 }, (_, index) => `a${index}`).join(
      ' && ',
    )
    let { find } = createTestFile(source)

    expect(getLogicalChain(find('LogicalExpression', source))).toHaveLength(
      20_000,
    )
  })
})
