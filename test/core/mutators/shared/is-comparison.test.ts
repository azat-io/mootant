import { describe, expect, it } from 'vitest'

import { isComparison } from '../../../../core/mutators/shared/is-comparison'
import { createTestFile } from '../../../helpers/create-test-file'

describe('isComparison', () => {
  it.each(['a < b', 'a >= b', 'a !== b', 'a == b', 'a in b', 'a instanceof b'])(
    'accepts %s',
    text => {
      let { find } = createTestFile(`x = ${text}`)

      expect(isComparison(find('BinaryExpression', text))).toBe(true)
    },
  )

  it.each(['a + b', 'a & b', 'a ** b'])('rejects %s', text => {
    let { find } = createTestFile(`x = ${text}`)

    expect(isComparison(find('BinaryExpression', text))).toBe(false)
  })

  it('accepts a private name check', () => {
    let { find } = createTestFile('class A { #x; m(o) { return #x in o } }')

    expect(isComparison(find('BinaryExpression'))).toBe(true)
  })

  it('rejects other nodes and null', () => {
    let { find } = createTestFile('x = a && b')

    expect(isComparison(find('LogicalExpression'))).toBe(false)
    expect(isComparison(null)).toBe(false)
  })
})
