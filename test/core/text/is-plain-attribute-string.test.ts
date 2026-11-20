import { describe, expect, it } from 'vitest'

import { isPlainAttributeString } from '../../../core/text/is-plain-attribute-string'

/**
 * Line separator, which a JavaScript string may hold as it is.
 */
const LINE_SEPARATOR = String.fromCodePoint(0x20_28)

/**
 * No-break space.
 */
const NO_BREAK_SPACE = String.fromCodePoint(0xa0)

describe('isPlainAttributeString', () => {
  it.each([
    '"password"',
    "'Cart'",
    '""',
    `'say "hi"'`,
    `"it's"`,
    '"?a=1&b=2"',
    '"a & b"',
    '"&copy"',
    '"{a} <b>"',
    `"a${LINE_SEPARATOR}b"`,
    `"a${NO_BREAK_SPACE}b"`,
  ])('accepts %s', text => {
    expect(isPlainAttributeString(text)).toBe(true)
  })

  it.each([
    String.raw`"\d+"`,
    '"a\tb"',
    '"a\nb"',
    '"a\rb"',
    '"a &amp; b"',
    '"&nbsp;"',
    '"&#65;"',
    '"&#+65;"',
    '"&#x41"',
    'password',
    '"a" + "b"',
    '("a")',
    '`a`',
    `"a'`,
  ])('rejects %s', text => {
    expect(isPlainAttributeString(text)).toBe(false)
  })
})
