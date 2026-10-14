import { describe, expect, it } from 'vitest'

import { isLookupPosition } from '../../../../core/mutators/shared/is-lookup-position'
import { createTestContext } from '../../../helpers/create-test-context'

describe('isLookupPosition', () => {
  it.each<[string, string, boolean]>([
    ['if (s.includes(a)) run()', 's.includes(a)', true],
    ['if (s.includes(a) && b) run()', 's.includes(a)', true],
    ['x = s.indexOf(a) > 0', 's.indexOf(a)', true],
    [
      'function f(s: string): boolean { return s.includes(a) }',
      's.includes(a)',
      true,
    ],
    [
      'function f(s: string): boolean { const found = s.includes(a); return found }',
      's.includes(a)',
      true,
    ],
    ['if (s?.includes(a)) run()', 's?.includes(a)', true],
    ['if (m?.get(a).ready) run()', 'm?.get(a)', false],
    ['x = s.includes(a)', 's.includes(a)', false],
  ])('answers the lookup in %s', (source, text, expected) => {
    let { context, find } = createTestContext(source)

    expect(isLookupPosition(find('CallExpression', text), context)).toBe(
      expected,
    )
  })
})
