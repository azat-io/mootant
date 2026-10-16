import { describe, expect, it } from 'vitest'

import { wrapText } from '../../../cli/terminal/wrap-text'

describe('wrapText', () => {
  it('wraps at spaces to fit the width', () => {
    expect(wrapText('one two three four', 9)).toStrictEqual([
      'one two',
      'three',
      'four',
    ])
  })

  it('keeps a word wider than the width on its own line', () => {
    expect(wrapText('a very-long-word b', 5)).toStrictEqual([
      'a',
      'very-long-word',
      'b',
    ])
  })

  it('keeps a line that fits', () => {
    expect(wrapText('short', Infinity)).toStrictEqual(['short'])
  })
})
