import { describe, expect, it } from 'vitest'

import { needsSeparator } from '../../../core/text/needs-separator'

describe('needsSeparator', () => {
  it.each([
    ['+', '+b'],
    ['-', '-b'],
    ['a-', '--b'],
    ['/', '/x/'],
    ['/', '*b'],
    ['a<', '!--b'],
    ['a', 'in'],
    ['in', 'b'],
    ['$', 'a'],
    ['a', '_b'],
    ['\u{1D4B3}', 'in'],
    ['a', '\u{1D4B3}'],
    ['a\u{1D4B3}', 'b'],
    ['in', '\u{E9}'],
    ['a', '\u{200C}b'],
    ['1', '.x'],
    ['a<', '<number>b'],
    ['a', String.raw`\u0078`],
    ['in', String.raw`\u{78}`],
  ])('separates %j from %j', (before, after) => {
    expect(needsSeparator(before, after)).toBe(true)
  })

  it.each([
    ['', '+b'],
    ['+', ''],
    ['', ''],
    ['+', '-b'],
    ['-', '+b'],
    ['*', '*b'],
    ['/', '=b'],
    ['a<', '!-b'],
    ['a<', '!b'],
    ['a<=', '!--b'],
    ['a', '(b)'],
    [')', 'in'],
    ['a', ' in'],
    ['1', '?.x'],
    ['a', '.x'],
    ['1 ', '.x'],
    ['.', '1'],
    ['0x1F', '.toString()'],
    ['\u{1D4B3}', '+'],
    ['a\u{D835}', 'in'],
    ['<', '(b)'],
    ['a as T<b>', '>c'],
  ])('does not separate %j from %j', (before, after) => {
    expect(needsSeparator(before, after)).toBe(false)
  })
})
