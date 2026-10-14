import { describe, expect, it } from 'vitest'

import { getCallTop } from '../../../../core/mutators/shared/get-call-top'
import { createTestContext } from '../../../helpers/create-test-context'

describe('getCallTop', () => {
  it.each<[string, string, string]>([
    ['x = s.trim()', 's.trim()', 'CallExpression'],
    ['x = s?.trim()', 's?.trim()', 'ChainExpression'],
    ['x = s?.trim()!', 's?.trim()', 'ChainExpression'],
    ['x = s?.trim().length', 's?.trim()', 'CallExpression'],
  ])('finds the top of the call in %s', (source, text, expected) => {
    let { context, find } = createTestContext(source)

    expect(getCallTop(find('CallExpression', text), context).type).toBe(
      expected,
    )
  })
})
