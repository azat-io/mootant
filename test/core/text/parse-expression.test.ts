import { describe, expect, it } from 'vitest'

import { parseExpression } from '../../../core/text/parse-expression'

describe('parseExpression', () => {
  it('parses an expression in parentheses', () => {
    expect(parseExpression('1 + 2', 'js')).toMatchObject({
      expression: { type: 'BinaryExpression', operator: '+' },
      type: 'ParenthesizedExpression',
    })
    expect(parseExpression('n as number', 'ts')).toMatchObject({
      expression: { type: 'TSAsExpression' },
    })
  })

  it('rejects text that is not one expression', () => {
    expect(parseExpression('1 +', 'js')).toBeNull()
    expect(parseExpression('1); f(', 'js')).toBeNull()
    expect(parseExpression('n as number', 'js')).toBeNull()
  })
})
