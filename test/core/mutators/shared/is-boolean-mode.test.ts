import { describe, expect, it } from 'vitest'

import { isBooleanMode } from '../../../../core/mutators/shared/is-boolean-mode'
import { createTestContext } from '../../../helpers/create-test-context'

describe('isBooleanMode', () => {
  it.each<[string, boolean]>([
    ['if (a && b) {}', true],
    ['x = a < c && b > c', true],
    ['function f(): boolean { return a && b }', true],
    ['rows.filter(r => a || b)', true],
    ['x = !(a && b)', true],
    ['if ((a && b) || c) {}', true],
    ['if (!(a && b) || c) {}', true],
    ['x = a && b', false],
    ['x = (a && b) || c', false],
    ['x = !c ? a || b : d', false],
  ])('answers the group of a in %s with %s', (source, expected) => {
    let { context, find } = createTestContext(source)
    let group = context.sourceCode.getParent(find('Identifier', 'a'))!

    expect(isBooleanMode(group, context)).toBe(expected)
  })
})
