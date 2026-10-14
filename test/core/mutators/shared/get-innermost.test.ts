import { describe, expect, it } from 'vitest'

import { getInnermost } from '../../../../core/mutators/shared/get-innermost'
import { createTestFile } from '../../../helpers/create-test-file'

describe('getInnermost', () => {
  it.each<[string, number]>([
    ['x = a', 0],
    ['x = (a as any)', 0],
    ['x = !a', 1],
    ['x = !(!a)', 2],
    ['x = !(!a as boolean)!', 2],
  ])('descends %s', (source, negations) => {
    let { find } = createTestFile(source)
    let start = find('AssignmentExpression').right

    expect(getInnermost(start)).toEqual({
      node: find('Identifier', 'a'),
      negations,
    })
  })
})
