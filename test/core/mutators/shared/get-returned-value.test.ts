import { describe, expect, it } from 'vitest'

import { getReturnedValue } from '../../../../core/mutators/shared/get-returned-value'
import { createTestContext } from '../../../helpers/create-test-context'

describe('getReturnedValue', () => {
  it.each<[string, string | null]>([
    ['function f() { if (x) return (a) }', 'a'],
    ['function f() { if (x) { return a } }', 'a'],
    ['function f() { if (x) { a(); return b } }', null],
    ['function f() { if (x) return }', null],
    ['function f() { if (x) a() }', null],
  ])('reads the consequent of %s', (source, expected) => {
    let { context, find } = createTestContext(source)
    let value = getReturnedValue(find('IfStatement').consequent)

    expect(value && context.sourceCode.getText(value)).toBe(expected)
  })

  it('reads no value from a missing branch', () => {
    expect(getReturnedValue(null)).toBeNull()
  })
})
