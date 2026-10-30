import { describe, expect, it } from 'vitest'

import { separateReplacement } from '../../../cli/diff/separate-replacement'

/**
 * Separates the replacement of the first occurrence of a fragment.
 *
 * @param source - Text of the file.
 * @param fragment - Text to replace.
 * @param replacement - Text written in its place.
 * @returns The replacement with the spaces it needs.
 */
function separate(
  source: string,
  fragment: string,
  replacement: string,
): string {
  let start = source.indexOf(fragment)
  return separateReplacement(source, {
    end: start + fragment.length,
    replacement,
    start,
  })
}

describe('separateReplacement', () => {
  it.each([
    {
      source: 'return!flag',
      replacement: 'true',
      fragment: '!flag',
      expected: ' true',
    },
    {
      source: 'x = 1..toFixed(2)',
      replacement: '2',
      fragment: '1.',
      expected: '2 ',
    },
    { source: 'x = a+-b', replacement: '+b', expected: ' +b', fragment: '-b' },
    {
      source: 'typeof(a)in b',
      replacement: 'a',
      fragment: '(a)',
      expected: ' a ',
    },
    { source: 'x = a-(0)-b', fragment: '(0)', replacement: '', expected: ' ' },
  ])(
    'writes $replacement in place of $fragment in $source as "$expected"',
    ({ replacement, fragment, expected, source }) => {
      expect(separate(source, fragment, replacement)).toBe(expected)
    },
  )

  it('keeps a replacement at the edges of the file as it is', () => {
    expect(separate('flag', 'flag', 'true')).toBe('true')
  })

  it('reads the whole last character before the replacement', () => {
    expect(separate('x = 𝑎!b', '!b', 'true')).toBe(' true')
  })
})
