import { describe, expect, it } from 'vitest'

import { formatChange } from '../../cli/format-change'

describe('formatChange', () => {
  it('joins the shortened fragments with an arrow', () => {
    expect(formatChange({ original: 'a\n  < b', replacement: '' })).toBe(
      'a < b -> (empty)',
    )
  })
})
