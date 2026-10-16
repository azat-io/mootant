import { describe, expect, it } from 'vitest'

import { keepsNeighborTokens } from '../../../core/regex/keeps-neighbor-tokens'
import { parseRegexPattern } from '../../../core/regex/parse-regex-pattern'

/**
 * Applies an edit to a pattern and checks the tokens around it.
 *
 * @param pattern - Original pattern.
 * @param flags - Flags of the literal.
 * @param edit - Edit relative to the pattern.
 * @param edit.start - Start of the replaced part.
 * @param edit.end - End of the replaced part.
 * @param edit.text - New text of the part.
 * @returns Whether the edited pattern keeps the tokens around the edit.
 */
function check(
  pattern: string,
  flags: string,
  edit: { start: number; text: string; end: number },
): boolean {
  return keepsNeighborTokens(parseRegexPattern(pattern, flags)!, flags, edit)
}

describe('keepsNeighborTokens', () => {
  it.each<[string, string, { start: number; text: string; end: number }]>([
    ['^ab$', '', { start: 0, text: '', end: 1 }],
    [String.raw`(a)\1?x`, '', { start: 5, text: '', end: 6 }],
    [String.raw`a\d+`, '', { text: '[^]', start: 1, end: 3 }],
    ['a{2,5}', '', { text: '{2}', start: 1, end: 6 }],
    ['[a]', '', { text: '^', start: 1, end: 1 }],
    ['[^a]', '', { start: 1, text: '', end: 2 }],
    ['[a-c]', '', { text: 'b', start: 1, end: 2 }],
    [String.raw`\bfoo`, '', { start: 0, text: '', end: 2 }],
  ])('keeps the tokens of %s with %o', (pattern, flags, edit) => {
    expect(check(pattern, flags, edit)).toBe(true)
  })

  it.each<[string, string, { start: number; text: string; end: number }]>([
    [String.raw`(a)\1?0`, '', { start: 5, text: '', end: 6 }],
    [String.raw`(a)\1(?=x)0`, '', { start: 5, text: '', end: 10 }],
    [String.raw`[a\w-z]`, '', { start: 2, text: '', end: 4 }],
    ['[a^b]', '', { start: 1, text: '', end: 2 }],
    ['[^^a]', '', { start: 1, text: '', end: 2 }],
    ['a{(?=x)2}', '', { start: 2, text: '', end: 7 }],
  ])('rejects the merged tokens of %s with %o', (pattern, flags, edit) => {
    expect(check(pattern, flags, edit)).toBe(false)
  })

  it('rejects a new pattern that does not parse', () => {
    expect(check('ab', '', { text: '(', start: 1, end: 1 })).toBe(false)
  })
})
