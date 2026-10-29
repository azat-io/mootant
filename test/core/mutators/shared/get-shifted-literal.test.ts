import type { Node } from 'oxc-parser'

import { describe, expect, it } from 'vitest'

import { getShiftedLiteral } from '../../../../core/mutators/shared/get-shifted-literal'
import { createTestFile } from '../../../helpers/create-test-file'

describe('getShiftedLiteral', () => {
  it.each<{
    comparison: string
    type: Node['type']
    literal: string
    step: -1 | 1
  }>([
    { comparison: 'n > 10', type: 'Literal', literal: '10', step: 1 },
    { comparison: 'n <= 10', type: 'Literal', literal: '10', step: 1 },
    { comparison: 'n < 10', type: 'Literal', literal: '10', step: -1 },
    { comparison: 'n >= 10', type: 'Literal', literal: '10', step: -1 },
    { comparison: '10 < n', type: 'Literal', literal: '10', step: 1 },
    { comparison: '10 >= n', type: 'Literal', literal: '10', step: 1 },
    { comparison: '10 > n', type: 'Literal', literal: '10', step: -1 },
    { comparison: '10 <= n', type: 'Literal', literal: '10', step: -1 },
    { comparison: 'n > (10)', type: 'Literal', literal: '10', step: 1 },
    { comparison: 'n > 10n', type: 'Literal', literal: '10n', step: 1 },
    {
      type: 'UnaryExpression',
      comparison: 'n > -1',
      literal: '-1',
      step: 1,
    },
  ])(
    'shifts the literal of $comparison',
    ({ comparison, literal, type, step }) => {
      let { find } = createTestFile(`x = ${comparison}`)

      expect(
        getShiftedLiteral(find('BinaryExpression', comparison)),
      ).toStrictEqual({ literal: find(type, literal), step })
    },
  )

  it.each<[string, Node['type'], string]>([
    ['x = n === 10', 'BinaryExpression', 'n === 10'],
    ['x = n > m', 'BinaryExpression', 'n > m'],
    ['x = 1 < 2', 'BinaryExpression', '1 < 2'],
    ['x = n', 'Identifier', 'n'],
  ])('shifts nothing in %s', (source, type, text) => {
    let { find } = createTestFile(source)

    expect(getShiftedLiteral(find(type, text))).toBeNull()
  })
})
