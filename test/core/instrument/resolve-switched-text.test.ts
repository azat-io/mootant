import { describe, expect, it } from 'vitest'

import { resolveSwitchedText } from '../../../core/instrument/resolve-switched-text'

/**
 * Byte order mark at the start of a text read as UTF-8.
 */
const BYTE_ORDER_MARK = String.fromCodePoint(0xfe_ff)

describe('resolveSwitchedText', () => {
  it('serves the switched text for the listed text', () => {
    expect(
      resolveSwitchedText({ original: 'a', switched: 'b', file: '/a.ts' }, 'a'),
    ).toBe('b')
  })

  it('drops the byte order mark when the loader dropped it', () => {
    expect(
      resolveSwitchedText(
        {
          original: `${BYTE_ORDER_MARK}a`,
          switched: `${BYTE_ORDER_MARK}b`,
          file: '/a.ts',
        },
        'a',
      ),
    ).toBe('b')
  })

  it.each([
    ['a changed text', 'a', 'c'],
    ['a text with a mark the listed one lacks', 'a', `${BYTE_ORDER_MARK}a`],
    ['a changed text after a mark', `${BYTE_ORDER_MARK}a`, 'c'],
  ])('serves %s as is', (_description, original, code) => {
    expect(
      resolveSwitchedText({ switched: 'b', file: '/a.ts', original }, code),
    ).toBeNull()
  })
})
