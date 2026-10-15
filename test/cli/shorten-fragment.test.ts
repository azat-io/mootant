import { describe, expect, it } from 'vitest'

import { shortenFragment } from '../../cli/shorten-fragment'

describe('shortenFragment', () => {
  it('collapses whitespace on one line', () => {
    expect(shortenFragment('  a\n\t+  b ')).toBe('a + b')
  })

  it('names an empty fragment', () => {
    expect(shortenFragment(' \n')).toBe('(empty)')
  })

  it('keeps a fragment of 60 characters', () => {
    expect(shortenFragment('x'.repeat(60))).toBe('x'.repeat(60))
  })

  it('cuts a longer fragment', () => {
    expect(shortenFragment('x'.repeat(61))).toBe(`${'x'.repeat(57)}...`)
  })

  it('never splits an astral character', () => {
    expect(shortenFragment(`${'x'.repeat(56)}😀${'x'.repeat(10)}`)).toBe(
      `${'x'.repeat(56)}...`,
    )
  })
})
