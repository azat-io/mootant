import { describe, expect, it } from 'vitest'

import { getCallTarget } from '../../../../core/mutators/shared/get-call-target'
import { createTestContext } from '../../../helpers/create-test-context'

describe('getCallTarget', () => {
  it('replaces a call in a value position', () => {
    let { context, find } = createTestContext('x = items.slice(-1)')
    let call = find('CallExpression')

    expect(getCallTarget(call, context)).toBe(call)
  })

  it('replaces the root of the optional chain that can skip the call', () => {
    let { context, find } = createTestContext('x = items?.slice(-1).length')

    expect(getCallTarget(find('CallExpression'), context)).toBe(
      find('ChainExpression'),
    )
  })

  it('keeps a call outside a value position and outside a chain', () => {
    let { context, find } = createTestContext('delete items.slice(-1)')
    let call = find('CallExpression')

    expect(getCallTarget(call, context)).toBe(call)
  })
})
