import { describe, expect, it } from 'vitest'

import { pickFocus } from '../../../core/generate/pick-focus'

describe('pickFocus', () => {
  it('copies the focus', () => {
    let focus = { start: 1, text: '', end: 2 }

    expect(pickFocus({ focus })).toStrictEqual({ focus })
  })

  it('returns no key without a focus', () => {
    expect(pickFocus({})).toStrictEqual({})
  })
})
