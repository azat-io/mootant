import { describe, expect, it } from 'vitest'

import { needsGrouping } from '../../../core/text/needs-grouping'
import { createTestFile } from '../../helpers/create-test-file'

describe('needsGrouping', () => {
  it.each([
    { expected: false, operator: '**', source: '(-a)', side: 'left' },
    { source: '(a + b)', expected: false, operator: '*', side: 'right' },
    { operator: '**', expected: true, source: '-a', side: 'left' },
    { operator: '**', expected: true, source: '<T>a', side: 'left' },
    { expected: false, operator: '**', side: 'right', source: '-a' },
    { expected: false, operator: '*', source: '-a', side: 'left' },
    { expected: false, operator: '**', side: 'left', source: 'a' },
    { expected: false, operator: '**', source: 'f()', side: 'right' },
    { source: 'a || b', operator: '??', expected: true, side: 'left' },
    { source: 'a && b', operator: '??', expected: true, side: 'right' },
    { source: 'a ?? b', operator: '&&', expected: true, side: 'left' },
    { source: 'a ?? b', operator: '||', expected: true, side: 'right' },
    { source: 'a ?? b', expected: false, operator: '??', side: 'left' },
    { source: 'a ?? b', operator: '??', expected: true, side: 'right' },
    { source: 'a ?? b', expected: true, operator: '|', side: 'left' },
    { expected: false, source: 'a | b', operator: '??', side: 'left' },
    { source: 'a && b', expected: false, operator: '||', side: 'left' },
    { source: 'a || b', operator: '&&', expected: true, side: 'left' },
    { source: 'a < b', expected: true, operator: '>', side: 'left' },
    { source: 'a < b', expected: true, operator: '>', side: 'right' },
    { source: 'a <= b', expected: false, operator: '>', side: 'left' },
    { expected: false, source: 'a < b', operator: '>=', side: 'left' },
    { source: 'a + b', expected: true, operator: '*', side: 'left' },
    { expected: false, source: 'a * b', operator: '+', side: 'left' },
    { expected: false, source: 'a + b', operator: '-', side: 'left' },
    { source: 'a ** b', operator: '**', expected: true, side: 'left' },
    { source: 'a + b', expected: true, operator: '-', side: 'right' },
    { expected: false, source: 'a * b', operator: '+', side: 'right' },
    { source: 'a ** b', expected: false, operator: '**', side: 'right' },
    { source: 'a == b', expected: true, operator: '<', side: 'right' },
    { source: 'a as T', expected: true, operator: '<', side: 'right' },
    { source: 'a satisfies T', expected: true, operator: '+', side: 'left' },
    { source: 'a as T', expected: true, operator: '==', side: 'left' },
    { source: 'a as T', expected: false, operator: '==', side: 'right' },
    { source: 'a as T', expected: true, operator: '|', side: 'left' },
    { source: 'a as T', expected: true, operator: '&', side: 'left' },
    { source: 'a as T', expected: true, operator: '<', side: 'left' },
    { source: 'a satisfies T', expected: true, operator: '|', side: 'left' },
  ] as const)(
    'returns $expected for $source on the $side of $operator in TypeScript',
    ({ operator, expected, source, side }) => {
      let operand = createTestFile(source, 'example.ts').find(
        'ExpressionStatement',
      ).expression

      expect(
        needsGrouping(operand, operator, { language: 'typescript', side }),
      ).toBe(expected)
    },
  )

  it('wraps an awaited left operand of **', () => {
    let operand = createTestFile('await a', 'example.mts').find(
      'ExpressionStatement',
    ).expression

    expect(
      needsGrouping(operand, '**', { language: 'typescript', side: 'left' }),
    ).toBe(true)
  })

  it('keeps a left < operand of > in JavaScript', () => {
    let operand = createTestFile('a < b', 'example.js').find(
      'ExpressionStatement',
    ).expression

    expect(
      needsGrouping(operand, '>', { language: 'javascript', side: 'left' }),
    ).toBe(false)
  })
})
