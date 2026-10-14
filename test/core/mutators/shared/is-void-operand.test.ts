import { describe, expect, it } from 'vitest'

import { isVoidOperand } from '../../../../core/mutators/shared/is-void-operand'
import { createTestContext } from '../../../helpers/create-test-context'

describe('isVoidOperand', () => {
  it.each<[string, boolean]>([
    ['x = void 0', true],
    ['x = void (0 as number)', true],
    ['x = void !0', true],
    ['x = void f(0)', false],
    ['x = -0', false],
    ['x = 0', false],
  ])('answers 0 in %s', (source, expected) => {
    let { context, find } = createTestContext(source)

    expect(isVoidOperand(find('Literal', '0'), context)).toBe(expected)
  })
})
