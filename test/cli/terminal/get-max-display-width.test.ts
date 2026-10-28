import { describe, expect, it } from 'vitest'

import { getMaxDisplayWidth } from '../../../cli/terminal/get-max-display-width'
import { createColors } from '../../../cli/terminal/colors'

describe('getMaxDisplayWidth', () => {
  it('finds the widest text, counting wide characters as two and colors as none', () => {
    let red = createColors(true).red('abc')

    expect(getMaxDisplayWidth(['ab', '中文字', red])).toBe(6)
  })

  it('gives 0 without texts', () => {
    expect(getMaxDisplayWidth([])).toBe(0)
  })

  it('takes more texts than a function takes arguments', () => {
    let texts = Array.from({ length: 200_000 }, () => 'a')

    expect(getMaxDisplayWidth(texts)).toBe(1)
  })
})
