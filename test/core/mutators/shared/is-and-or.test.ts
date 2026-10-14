import { describe, expect, it } from 'vitest'

import { isAndOr } from '../../../../core/mutators/shared/is-and-or'
import { createTestFile } from '../../../helpers/create-test-file'

describe('isAndOr', () => {
  it.each<[string, boolean]>([
    ['a && b', true],
    ['a || b', true],
    ['a ?? b', false],
  ])('answers %s with %s', (text, expected) => {
    let { find } = createTestFile(`x = ${text}`)

    expect(isAndOr(find('LogicalExpression'))).toBe(expected)
  })

  it('rejects other nodes and null', () => {
    let { find } = createTestFile('x = a & b')

    expect(isAndOr(find('BinaryExpression'))).toBe(false)
    expect(isAndOr(null)).toBe(false)
  })
})
