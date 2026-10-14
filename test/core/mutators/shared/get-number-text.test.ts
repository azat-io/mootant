import type { Node } from 'oxc-parser'

import { describe, expect, it } from 'vitest'

import { getNumberText } from '../../../../core/mutators/shared/get-number-text'
import { createTestFile } from '../../../helpers/create-test-file'

describe('getNumberText', () => {
  it.each<{
    expected: string | null
    type: Node['type']
    text: string
    step: -1 | 1
  }>([
    { type: 'Literal', expected: '1', text: '0', step: 1 },
    { type: 'Literal', expected: '-1', text: '0', step: -1 },
    { type: 'Literal', expected: '11', text: '10', step: 1 },
    { expected: '1001', type: 'Literal', text: '1_000', step: 1 },
    { expected: '1001', type: 'Literal', text: '1e3', step: 1 },
    { type: 'Literal', expected: '1.2', text: '0.2', step: 1 },
    { type: 'Literal', expected: '2', text: '1.', step: 1 },
    { type: 'UnaryExpression', expected: '0', text: '-1', step: 1 },
    { type: 'UnaryExpression', expected: '-1.5', text: '-2.5', step: 1 },
    { expected: '0x100', type: 'Literal', text: '0xff', step: 1 },
    { expected: '0x100', type: 'Literal', text: '0xFF', step: 1 },
    { expected: '0x1E', type: 'Literal', text: '0x1F', step: -1 },
    { expected: '0o10', type: 'Literal', text: '0o7', step: 1 },
    { expected: '0B10', type: 'Literal', text: '0B1', step: 1 },
    { type: 'Literal', expected: '-1', text: '0x0', step: -1 },
    { type: 'UnaryExpression', expected: '-15', text: '-0x10', step: 1 },
    { type: 'Literal', expected: '11n', text: '10n', step: 1 },
    { type: 'Literal', expected: '-1n', text: '0n', step: -1 },
    { expected: '0x20n', type: 'Literal', text: '0x1Fn', step: 1 },
    { expected: '0x20n', type: 'Literal', text: '0x1_fn', step: 1 },
    { type: 'UnaryExpression', expected: '0n', text: '-1n', step: 1 },
    { type: 'ParenthesizedExpression', expected: '4', text: '(5)', step: -1 },
    { text: '9007199254740993', type: 'Literal', expected: null, step: 1 },
    { type: 'Literal', expected: null, text: "'a'", step: 1 },
    { type: 'Literal', expected: null, text: 'true', step: 1 },
  ])('moves $text by $type', ({ expected, text, type, step }) => {
    let { find } = createTestFile(`x = ${text}`)

    expect(getNumberText(find(type, text), step)).toBe(expected)
  })
})
