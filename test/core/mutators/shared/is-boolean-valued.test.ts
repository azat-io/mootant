import { describe, expect, it } from 'vitest'

import { isBooleanValued } from '../../../../core/mutators/shared/is-boolean-valued'
import { createTestContext } from '../../../helpers/create-test-context'

describe('isBooleanValued', () => {
  it.each<[string, boolean]>([
    ['x = a < b', true],
    ['x = !a', true],
    ['x = true', true],
    ['x = (false as boolean)', true],
    ['x = Boolean(a)', true],
    ['x = Boolean(a, extra)', true],
    ['x = Boolean?.(a)', true],
    ['x = (Boolean)(a)', true],
    ['x = a < b && !c', true],
    ['x = !a || (b === c)', true],
    ['let f: boolean; x = f', true],
    ['x = a < b && c', false],
    ['x = c || a < b', false],
    ['let Boolean = g; x = Boolean?.(a)', false],
    ['x = String(a)', false],
    ['x = a?.b()', false],
    ['let f: boolean | undefined; x = f', false],
    ['x = a', false],
    ['x = 1', false],
  ])('answers %s with %s', (source, expected) => {
    let { context, find } = createTestContext(source)

    expect(isBooleanValued(find('AssignmentExpression').right, context)).toBe(
      expected,
    )
  })
})
