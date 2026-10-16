// spell-checker:ignore msrc
import { describe, expect, it } from 'vitest'

import { createTextStyle } from '../../helpers/create-text-style'
import { formatFields } from '../../../cli/report/format-fields'
import { showEscapes } from '../../helpers/show-escapes'

describe('formatFields', () => {
  it('lines up the values after gray labels', () => {
    expect(
      showEscapes(
        formatFields(
          [
            ['dry run', '3 tests in 0.2s'],
            ['most test time', '\u{1B}[1msrc/a.ts 50%\u{1B}[22m'],
          ],
          createTextStyle({ colors: true }),
        ),
      ),
    ).toBe(
      [
        '<90>dry run         <39>3 tests in 0.2s',
        '<90>most test time  <39><1>src/a.ts 50%<22>',
      ].join('\n'),
    )
  })

  it('cuts a value wider than the line, without its colors', () => {
    expect(
      formatFields(
        [
          ['time', `\u{1B}[1m${'x'.repeat(30)}\u{1B}[22m`],
          ['score', '50%'],
        ],
        createTextStyle({ width: 30 }),
      ),
    ).toBe(`${'time'.padEnd(16)}${'x'.repeat(13)}…\n${'score'.padEnd(16)}50%`)
  })

  it('keeps a few columns of a value however narrow the line is', () => {
    expect(
      formatFields(
        [['time', 'x'.repeat(20)]],
        createTextStyle({ unicode: false, width: 10 }),
      ),
    ).toBe(`${'time'.padEnd(16)}${'x'.repeat(9)}...`)
  })
})
