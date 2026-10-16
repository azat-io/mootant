import { describe, expect, it } from 'vitest'

import { swapStringQuotes } from '../../../core/text/swap-string-quotes'

describe('swapStringQuotes', () => {
  it('rewrites the strings written with the quote in the other quote', () => {
    expect(swapStringQuotes(`a ? "x" : 'y' + "it's"`, '"', 'js')).toBe(
      String.raw`a ? 'x' : 'y' + 'it\x27s'`,
    )
    expect(swapStringQuotes(`f('', "b")`, "'", 'ts')).toBe(`f("", "b")`)
  })

  it('escapes what the other quote cannot hold as is', () => {
    let separators = `${String.raw`\u`}2028${String.raw`\u`}2029`

    expect(
      swapStringQuotes(String.raw`"a\\b\n\r${separators}\x22"`, '"', 'js'),
    ).toBe(String.raw`'a\\b\n\r${separators}\x22'`)
  })

  it('keeps other text as written', () => {
    expect(swapStringQuotes('`"` + /"/.source', '"', 'js')).toBe(
      '`"` + /"/.source',
    )
  })

  it('keeps text that does not parse', () => {
    expect(swapStringQuotes('"a" +', '"', 'js')).toBe('"a" +')
  })
})
