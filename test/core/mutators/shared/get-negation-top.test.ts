import { describe, expect, it } from 'vitest'

import { getNegationTop } from '../../../../core/mutators/shared/get-negation-top'
import { createTestContext } from '../../../helpers/create-test-context'

describe('getNegationTop', () => {
  it.each<[string, string, number]>([
    ['x = a', 'a', 0],
    ['x = !a', '!a', 1],
    ['x = !(!a as boolean)', '!(!a as boolean)', 2],
    ['x = !b && a', 'a', 0],
  ])('climbs from a in %s', (source, top, negations) => {
    let { context, find } = createTestContext(source)
    let result = getNegationTop(find('Identifier', 'a'), context)

    expect(context.sourceCode.getText(result.node)).toBe(top)
    expect(result.negations).toBe(negations)
  })
})
