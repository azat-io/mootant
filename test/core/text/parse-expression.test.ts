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
    expect(parseExpression('1) } m() { (2', 'js')).toBeNull()
  })

  it('reads await, yield and super as in an async generator method', () => {
    expect(parseExpression('a + (yield b)', 'js')).toMatchObject({
      expression: { right: { type: 'ParenthesizedExpression' } },
    })
    expect(parseExpression('await a', 'js')).toMatchObject({
      expression: { type: 'AwaitExpression' },
    })
    expect(parseExpression('super.a', 'js')).toMatchObject({
      expression: { type: 'MemberExpression' },
    })
    expect(parseExpression('await | c', 'js')).toBeNull()
  })

  it('reads await as a name in a sloppy script', () => {
    expect(parseExpression('await | c', 'js', 'script')).toMatchObject({
      expression: { left: { name: 'await' }, operator: '|' },
      type: 'ParenthesizedExpression',
    })
    expect(parseExpression('1); f(', 'js', 'script')).toBeNull()
    expect(parseExpression('1 +', 'js', 'script')).toBeNull()
  })
})
