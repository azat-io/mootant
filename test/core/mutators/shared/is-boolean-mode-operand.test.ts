import { describe, expect, it } from 'vitest'

import { isBooleanModeOperand } from '../../../../core/mutators/shared/is-boolean-mode-operand'
import { createTestContext } from '../../../helpers/create-test-context'

describe('isBooleanModeOperand', () => {
  it.each<[string, boolean]>([
    ['if (a && b) {}', true],
    ['if (b || !a) {}', true],
    ['if (b || (a as boolean)) {}', true],
    ['x = a && b', false],
    ['if (a ?? b) {}', false],
    ['if (a) {}', false],
  ])('answers a in %s with %s', (source, expected) => {
    let { context, find } = createTestContext(source)

    expect(isBooleanModeOperand(find('Identifier', 'a'), context)).toBe(
      expected,
    )
  })
})
