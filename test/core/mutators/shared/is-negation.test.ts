import { describe, expect, it } from 'vitest'

import { isNegation } from '../../../../core/mutators/shared/is-negation'
import { createTestFile } from '../../../helpers/create-test-file'

describe('isNegation', () => {
  it('accepts a logical not', () => {
    let { find } = createTestFile('x = !a')

    expect(isNegation(find('UnaryExpression'))).toBe(true)
  })

  it.each(['-a', 'typeof a', 'void a'])('rejects %s', text => {
    let { find } = createTestFile(`x = ${text}`)

    expect(isNegation(find('UnaryExpression'))).toBe(false)
  })

  it('rejects other nodes and null', () => {
    let { find } = createTestFile('x = a')

    expect(isNegation(find('Identifier', 'a'))).toBe(false)
    expect(isNegation(null)).toBe(false)
  })
})
