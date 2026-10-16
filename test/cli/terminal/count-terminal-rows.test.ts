import { describe, expect, it } from 'vitest'

import { countTerminalRows } from '../../../cli/terminal/count-terminal-rows'

describe('countTerminalRows', () => {
  it('counts a short line as one row', () => {
    expect(countTerminalRows('⠋ testing mutants  3/12', 80)).toBe(1)
  })

  it('wraps a line at the width of the terminal', () => {
    expect(countTerminalRows('x'.repeat(20), 20)).toBe(1)
    expect(countTerminalRows('x'.repeat(21), 20)).toBe(2)
  })

  it('counts every line of a text, an empty one too', () => {
    expect(countTerminalRows(`${'x'.repeat(170)}\nsecond line\n`, 80)).toBe(5)
  })

  it('counts wide characters as two columns', () => {
    expect(countTerminalRows('大'.repeat(10), 20)).toBe(1)
    expect(countTerminalRows('大'.repeat(11), 20)).toBe(2)
  })

  it('leaves color codes out of the width', () => {
    expect(countTerminalRows(`\u{1B}[33m${'x'.repeat(20)}\u{1B}[39m`, 20)).toBe(
      1,
    )
  })

  it('assumes 80 columns when the width is unknown', () => {
    expect(countTerminalRows('x'.repeat(81))).toBe(2)
  })

  it('assumes 80 columns when the terminal reports no columns', () => {
    expect(countTerminalRows('x'.repeat(81), 0)).toBe(2)
  })
})
