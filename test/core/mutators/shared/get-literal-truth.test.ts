import { describe, expect, it } from 'vitest'

import { getLiteralTruth } from '../../../../core/mutators/shared/get-literal-truth'
import { createTestContext } from '../../../helpers/create-test-context'

describe('getLiteralTruth', () => {
  it.each<[string, boolean | null]>([
    ['x = true', true],
    ["x = ''", false],
    ["x = ('a')", true],
    ['x = 0', false],
    ['x = -1', true],
    ['x = 0n', false],
    ['x = `a`', true],
    ['x = null', false],
    ['x = undefined', false],
    ['x = void 0', false],
    ['x = /a/u', null],
    [`x = \`\${a}\``, null],
    ['x = y', null],
  ])('reads %s as %s', (source, expected) => {
    let { context, find } = createTestContext(source)
    let value = find('AssignmentExpression').right

    expect(getLiteralTruth(value, context)).toBe(expected)
  })
})
