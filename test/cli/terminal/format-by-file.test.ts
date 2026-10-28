import { describe, expect, it } from 'vitest'

import type { TextStyle } from '../../../types/cli/text-style'

import { formatByFile } from '../../../cli/terminal/format-by-file'
import { createTextStyle } from '../../helpers/create-text-style'
import { showEscapes } from '../../helpers/show-escapes'

/**
 * Formats notes grouped by file, each note on an indented line.
 *
 * @param notes - Files and texts in the order to print.
 * @param style - Colors, width and symbols of the output.
 * @returns Groups separated by an empty line.
 */
function formatNotes(
  notes: { file: string; text: string }[],
  style: TextStyle = createTextStyle(),
): string {
  return formatByFile(notes, {
    formatGroup: group => group.map(note => `  ${note.text}`).join('\n'),
    getFile: note => note.file,
    style,
  })
}

describe('formatByFile', () => {
  it('groups entries by file in the order of their first entry and keeps their order', () => {
    expect(
      formatNotes([
        { file: 'src/a.ts', text: 'first' },
        { file: 'src/b.ts', text: 'second' },
        { file: 'src/a.ts', text: 'third' },
      ]),
    ).toBe(
      ['src/a.ts', '  first', '  third', '', 'src/b.ts', '  second'].join('\n'),
    )
  })

  it('prints the path in bold', () => {
    expect(
      showEscapes(
        formatNotes(
          [{ file: 'src/a.ts', text: 'first' }],
          createTextStyle({ colors: true }),
        ),
      ),
    ).toBe('<1>src/a.ts<22>\n  first')
  })

  it('cuts a path wider than the line from its start', () => {
    expect(
      formatNotes(
        [{ file: 'src/nested/deep/file.ts', text: 'first' }],
        createTextStyle({ width: 14 }),
      ),
    ).toBe('…/deep/file.ts\n  first')
  })

  it('gives an empty text without entries', () => {
    expect(formatNotes([])).toBe('')
  })
})
