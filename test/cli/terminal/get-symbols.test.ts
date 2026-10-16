import { describe, expect, it } from 'vitest'

import { getSymbols } from '../../../cli/terminal/get-symbols'

describe('getSymbols', () => {
  it('picks Unicode marks where the terminal shows them', () => {
    expect(getSymbols(true)).toStrictEqual({
      ellipsis: '…',
      warning: '▲',
      cross: '✖',
      arrow: '→',
      check: '✔',
      dot: '●',
    })
  })

  it('falls back to ASCII', () => {
    expect(getSymbols(false)).toStrictEqual({
      ellipsis: '...',
      warning: '!',
      arrow: '->',
      cross: 'x',
      check: '+',
      dot: '*',
    })
  })
})
