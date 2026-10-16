import { describe, expect, it } from 'vitest'

import { getDisplayWidth } from '../../../cli/terminal/get-display-width'
import { createTextStyle } from '../../helpers/create-text-style'
import { formatHeader } from '../../../cli/report/format-header'
import { showEscapes } from '../../helpers/show-escapes'

describe('formatHeader', () => {
  it('ends the note where the widest line of the body ends', () => {
    let body = `rows\n${'x'.repeat(90)}`
    let header = formatHeader(
      { command: 'mootant run src', note: 'vitest 5.0.4' },
      body,
      createTextStyle({ width: 100 }),
    )

    expect(header).toBe(`● mootant run src${' '.repeat(61)}vitest 5.0.4`)
    expect(getDisplayWidth(header)).toBe(90)
  })

  it('handles a body of more lines than a function takes arguments', () => {
    let header = formatHeader(
      { command: 'mootant run src', note: 'vitest 5.0.4' },
      'row\n'.repeat(300_000),
      createTextStyle({ width: 100 }),
    )

    expect(getDisplayWidth(header)).toBe(60)
  })

  it('spans 60 columns at least and 100 at most', () => {
    let style = createTextStyle()

    expect(
      getDisplayWidth(
        formatHeader({ command: 'mootant list src', note: 'note' }, '', style),
      ),
    ).toBe(60)
    expect(
      getDisplayWidth(
        formatHeader(
          { command: 'mootant list src', note: 'note' },
          'x'.repeat(150),
          style,
        ),
      ),
    ).toBe(100)
  })

  it('stays within a narrow terminal', () => {
    let header = formatHeader(
      { command: 'mootant run src', note: 'vitest 5.0.4' },
      'x'.repeat(80),
      createTextStyle({ width: 40 }),
    )

    expect(header).toBe(`● mootant run src${' '.repeat(11)}vitest 5.0.4`)
  })

  it('leaves out a note that does not fit and cuts a long command', () => {
    let style = createTextStyle({ unicode: false, width: 30 })

    expect(
      formatHeader(
        { command: 'mootant run src --fast', note: 'vitest 5.0.4' },
        '',
        style,
      ),
    ).toBe('* mootant run src --fast')
    expect(
      formatHeader(
        { command: `mootant run ${'src/'.repeat(10)}`, note: 'vitest' },
        '',
        style,
      ),
    ).toBe('* mootant run src/src/src/s...')
  })

  it('colors the mark, the command and the note', () => {
    expect(
      showEscapes(
        formatHeader(
          { command: 'mootant run src', note: 'vitest' },
          '',
          createTextStyle({ colors: true, width: 30 }),
        ),
      ),
    ).toBe(`<92>●<39> <1>mootant run src<22>${' '.repeat(7)}<90>vitest<39>`)
  })
})
