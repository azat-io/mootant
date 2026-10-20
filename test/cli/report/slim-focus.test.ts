import { describe, expect, it } from 'vitest'

import { slimFocus } from '../../../cli/report/slim-focus'

describe('slimFocus', () => {
  it('keeps the position and texts of a focus without its offsets', () => {
    expect(
      slimFocus({
        replacement: '[^]',
        original: '[0-9]',
        column: 16,
        start: 15,
        line: 1,
        end: 20,
      }),
    ).toStrictEqual({
      replacement: '[^]',
      original: '[0-9]',
      column: 16,
      line: 1,
    })
  })
})
