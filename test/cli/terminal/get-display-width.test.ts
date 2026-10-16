import { describe, expect, it } from 'vitest'

import {
  getGraphemeWidth,
  getDisplayWidth,
  splitGraphemes,
} from '../../../cli/terminal/get-display-width'

describe('getDisplayWidth', () => {
  it('counts plain text, wide characters, emoji and marks by columns', () => {
    expect(getDisplayWidth('abc')).toBe(3)
    expect(getDisplayWidth('大きい')).toBe(6)
    expect(getDisplayWidth('한국어')).toBe(6)
    expect(getDisplayWidth('🎉 x')).toBe(4)
    expect(getDisplayWidth('👍🏽')).toBe(2)
    expect(getDisplayWidth('é')).toBe(1)
    expect(getDisplayWidth('a\u{200B}b')).toBe(2)
    expect(getDisplayWidth('→ ● ✔')).toBe(5)
  })

  it('ignores color codes', () => {
    expect(getDisplayWidth('\u{1B}[31m大\u{1B}[39m')).toBe(2)
  })
})

describe('getGraphemeWidth', () => {
  it('widens a symbol in its picture form', () => {
    expect(getGraphemeWidth('❤')).toBe(1)
    expect(getGraphemeWidth('❤️')).toBe(2)
    expect(getGraphemeWidth('\t')).toBe(0)
  })
})

describe('splitGraphemes', () => {
  it('keeps emoji and joined marks whole', () => {
    expect(splitGraphemes('a👨‍👩‍👧é')).toStrictEqual(['a', '👨‍👩‍👧', 'é'])
  })
})
