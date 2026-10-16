import { describe, expect, it } from 'vitest'

import { cutToWidth } from '../../../cli/terminal/cut-to-width'

describe('cutToWidth', () => {
  it('keeps text that fits', () => {
    expect(cutToWidth('abc', { ellipsis: '…', width: 3 })).toBe('abc')
  })

  it('cuts the end by default and the start when asked', () => {
    expect(cutToWidth('abcdef', { ellipsis: '…', width: 4 })).toBe('abc…')
    expect(
      cutToWidth('src/deep/file.ts', {
        ellipsis: '...',
        side: 'start',
        width: 10,
      }),
    ).toBe('...file.ts')
  })

  it('never splits a wide character or an emoji', () => {
    expect(cutToWidth('大きい数字', { ellipsis: '…', width: 6 })).toBe('大き…')
    expect(cutToWidth('a👨‍👩‍👧b', { ellipsis: '…', width: 3 })).toBe('a…')
  })

  it('leaves only the ellipsis when nothing else fits', () => {
    expect(cutToWidth('abc', { ellipsis: '…', width: 1 })).toBe('…')
  })
})
