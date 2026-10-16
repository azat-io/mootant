// spell-checker:ignore pression compatib secon
import { describe, expect, it } from 'vitest'

import { getDisplayWidth } from '../../../cli/terminal/get-display-width'
import { formatChange } from '../../../cli/diff/format-change'

describe('formatChange', () => {
  it('joins the sides on one line and names an empty side', () => {
    expect(formatChange({ original: 'a\n  < b', replacement: '' })).toBe(
      'a < b -> (empty)',
    )
    expect(formatChange({ replacement: ' x ', original: '' })).toBe(
      '(empty) -> x',
    )
    expect(formatChange({ replacement: '', original: ' ' })).toBe(
      '(empty) -> (empty)',
    )
  })

  it('takes the arrow and keeps a change that fits', () => {
    expect(
      formatChange(
        { replacement: 'a <= b', original: 'a < b' },
        { maxLength: 14, arrow: '→' },
      ),
    ).toBe('a < b → a <= b')
  })

  it('cuts the shared text around the change first, between words', () => {
    expect(
      formatChange(
        {
          replacement: 'sourceCode.getTokenBefore(previousToken).value',
          original: 'sourceCode.getTokenBefore(previousToken)?.value',
        },
        { ellipsis: '…', maxLength: 50, arrow: '→' },
      ),
    ).toBe('…(previousToken)?.value → …(previousToken).value')
  })

  it('keeps at most 20 shared characters on each side of the change', () => {
    expect(
      formatChange({
        replacement: `${'a'.repeat(50)}+${'b'.repeat(50)}`,
        original: `${'a'.repeat(50)}-${'b'.repeat(50)}`,
      }),
    ).toBe(
      `...${'a'.repeat(20)}-${'b'.repeat(20)}... -> ...${'a'.repeat(20)}+${'b'.repeat(20)}...`,
    )
  })

  it('cuts inside a word when a side keeps less than two shared characters', () => {
    expect(
      formatChange(
        {
          original:
            "parent.type === 'CallExpression' && parent.callee === node",
          replacement: "parent.type === 'CallExpression'",
        },
        { ellipsis: '…', maxLength: 50 },
      ),
    ).toBe("…pression' && parent.callee === node -> …pression'")
  })

  it('starts both sides near a changed text too wide to show whole', () => {
    expect(
      formatChange(
        {
          replacement: `go(${'y'.repeat(30)}`,
          original: `go(${'x'.repeat(30)}`,
        },
        { ellipsis: '…', maxLength: 30 },
      ),
    ).toBe(`go(${'x'.repeat(9)}… -> go(${'y'.repeat(9)}…`)
    expect(
      formatChange(
        {
          replacement: `prefix.${'y'.repeat(30)}`,
          original: `prefix.${'x'.repeat(30)}`,
        },
        { ellipsis: '…', maxLength: 30 },
      ),
    ).toBe(`….${'x'.repeat(10)}… -> ….${'y'.repeat(10)}…`)
    expect(
      formatChange(
        { replacement: `ab${'y'.repeat(30)}`, original: `ab${'x'.repeat(30)}` },
        { ellipsis: '…', maxLength: 30 },
      ),
    ).toBe(`ab${'x'.repeat(10)}… -> ab${'y'.repeat(10)}…`)
    expect(
      formatChange(
        {
          replacement: `${'shared.'.repeat(5)}${'y'.repeat(30)}`,
          original: `${'shared.'.repeat(5)}${'x'.repeat(30)}`,
        },
        { ellipsis: '…', maxLength: 30 },
      ),
    ).toBe(`….${'x'.repeat(10)}… -> ….${'y'.repeat(10)}…`)
  })

  it('gives a short side its room and cuts the long one', () => {
    expect(
      formatChange(
        { original: 'first + second + third', replacement: '0' },
        { ellipsis: '…', maxLength: 16 },
      ),
    ).toBe('first + se… -> 0')
    expect(
      formatChange(
        { replacement: 'x'.repeat(30), original: '' },
        { maxLength: 20 },
      ),
    ).toBe('(empty) -> xxxxxx...')
  })

  it('keeps each side within 60 columns without a room', () => {
    let change = formatChange({
      original: 'a'.repeat(100),
      replacement: '0',
    })

    expect(change).toBe(`${'a'.repeat(57)}... -> 0`)
  })

  it('counts wide characters as two columns', () => {
    let change = formatChange(
      { original: '大きい数字です'.repeat(3), replacement: "''" },
      { ellipsis: '…', maxLength: 24, arrow: '→' },
    )

    expect(change).toBe("大きい数字です大き… → ''")
    expect(getDisplayWidth(change)).toBeLessThanOrEqual(24)
  })

  it('keeps a word before a removal too wide to show whole', () => {
    expect(
      formatChange(
        {
          original:
            "isCompatible(update) || compatible.reason === 'cool-down' && done",
          replacement: 'isCompatible(update)',
        },
        { ellipsis: '…', maxLength: 50, arrow: '→' },
      ),
    ).toBe("…(update) || compatible.reason === 'c… → …(update)")
    expect(
      formatChange(
        {
          original: `${'b'.repeat(30)}) || compatible.reason === 'cool-down' && done`,
          replacement: `${'b'.repeat(30)})`,
        },
        { ellipsis: '…', maxLength: 50, arrow: '→' },
      ),
    ).toBe('…bbbbbbbbbb) || compatible.reason … → …bbbbbbbbbb)')
    expect(
      formatChange(
        {
          original: `${'b'.repeat(30)}) || compatible.reason === 'cool-down' && done`,
          replacement: `${'b'.repeat(30)})`,
        },
        { ellipsis: '…', maxLength: 30, arrow: '→' },
      ),
    ).toBe('…bbbbb) || compatib… → …bbbbb)')
  })

  it('keeps the shared text before a removal without words', () => {
    expect(
      formatChange(
        {
          original: `((((((((((((((((((((((((( || ${'x'.repeat(40)}`,
          replacement: '(((((((((((((((((((((((((',
        },
        { ellipsis: '…', maxLength: 40, arrow: '→' },
      ),
    ).toBe('…((((((((( || xxxxxxxxxxxx… → …(((((((((')
  })

  it('shrinks the added side of an insertion too wide to show whole', () => {
    expect(
      formatChange(
        {
          replacement: `first(${'x'.repeat(60)}, second)`,
          original: 'first(second)',
        },
        { ellipsis: '…', maxLength: 40, arrow: '→' },
      ),
    ).toBe(`first(secon… → first(${'x'.repeat(18)}…`)
  })

  it('cuts a removal at the start that leaves too little of the rest', () => {
    expect(
      formatChange(
        {
          original: "update.targetRefStyle === 'sha' && update.targetRef",
          replacement: 'update.targetRef',
        },
        { ellipsis: '…', maxLength: 44, arrow: '→' },
      ),
    ).toBe("update.targetRefStyle === '… → update.targe…")
  })
})
