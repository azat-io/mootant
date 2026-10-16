import { describe, expect, it } from 'vitest'

import { padToWidth } from '../../../cli/terminal/pad-to-width'

describe('padToWidth', () => {
  it('pads by columns, counting wide characters as two and colors as none', () => {
    expect(padToWidth('ab', 4)).toBe('ab  ')
    expect(padToWidth('大', 4)).toBe('大  ')
    expect(padToWidth('\u{1B}[1ma\u{1B}[22m', 2)).toBe('\u{1B}[1ma\u{1B}[22m ')
  })

  it('leaves text as wide as the width or wider as is', () => {
    expect(padToWidth('abc', 2)).toBe('abc')
  })
})
