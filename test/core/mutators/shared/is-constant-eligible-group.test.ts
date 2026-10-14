import { describe, expect, it } from 'vitest'

import { isConstantEligibleGroup } from '../../../../core/mutators/shared/is-constant-eligible-group'
import { createTestContext } from '../../../helpers/create-test-context'

describe('isConstantEligibleGroup', () => {
  it.each<[string, boolean]>([
    ['function f(u) { return u.isOwner && u.isActive }', true],
    ['function f(x) { return x === 0 && y > 3 && isOk(z) }', true],
    ['let f = (u) => (u.a || !u.b)', true],
    ['function f(u) { return u.a && u.b }', true],
    ['function f(u) { return u.a && true }', false],
    ['function f(u) { return u.a && !null }', false],
    ['function f(u) { return u.a && -1 }', false],
    ['function f(u) { return u.a && `x` }', false],
    ["function f(u) { return u.a && 'x' + u.b }", false],
    ['function f(u) { return !(u.a && u.b) }', false],
    ['function f(u) { x = u.a && u.b }', false],
    ['function f(u) { return u.a ?? u.b }', false],
  ])('answers the root of %s with %s', (source, expected) => {
    let { context, find } = createTestContext(source, { file: 'example.js' })
    let group = find('LogicalExpression')

    expect(isConstantEligibleGroup(group, context)).toBe(expected)
  })

  it('rejects a group in boolean mode', () => {
    let { context, find } = createTestContext(
      'function f(u): boolean { return u.a && u.b }',
    )

    expect(isConstantEligibleGroup(find('LogicalExpression'), context)).toBe(
      false,
    )
  })

  it('rejects other nodes', () => {
    let { context, find } = createTestContext('function f() { return a }')

    expect(isConstantEligibleGroup(find('Identifier', 'a'), context)).toBe(
      false,
    )
  })
})
