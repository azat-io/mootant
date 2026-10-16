import { afterEach, describe, expect, it, vi } from 'vitest'

import { getTextStyle } from '../../../cli/terminal/get-text-style'

describe('getTextStyle', () => {
  afterEach(() => {
    /* Cspell:disable-next-line */
    vi.unstubAllEnvs()
  })

  it('fits a terminal and colors it', () => {
    vi.stubEnv('NO_COLOR', '')
    vi.stubEnv('TERM', 'xterm-256color')
    let style = getTextStyle({ columns: 120, isTTY: true })

    expect(style.width).toBe(120)
    expect(style.colors.red('x')).toBe('\u{1B}[31mx\u{1B}[39m')
    expect(typeof style.unicode).toBe('boolean')
  })

  it('assumes 80 columns for a terminal without a width', () => {
    expect(getTextStyle({ isTTY: true, columns: 0 }).width).toBe(80)
    expect(getTextStyle({ isTTY: true }).width).toBe(80)
  })

  it('cuts nothing and colors nothing in a file or a pipe', () => {
    vi.stubEnv('FORCE_COLOR', '')
    vi.stubEnv('CI', '')
    let style = getTextStyle({})

    expect(style.width).toBe(Infinity)
    expect(style.colors.red('x')).toBe('x')
  })
})
