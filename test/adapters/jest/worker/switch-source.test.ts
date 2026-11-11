import { describe, expect, it } from 'vitest'

import { switchSource } from '../../../../adapters/jest/worker/switch-source'

describe('switchSource', () => {
  it('leaves the text of a file the plan does not have', () => {
    expect(switchSource(undefined, 'a + b')).toStrictEqual({
      text: 'a + b',
      kind: null,
    })
  })

  it('serves the switched text for the text mootant listed mutants from', () => {
    expect(
      switchSource(
        { switched: 'a - b', original: 'a + b', file: '/a.js' },
        'a + b',
      ),
    ).toStrictEqual({ kind: 'served', text: 'a - b' })
  })

  it('reports another text as mismatched and leaves it', () => {
    expect(
      switchSource(
        { switched: 'a - b', original: 'a + b', file: '/a.js' },
        'other',
      ),
    ).toStrictEqual({ kind: 'mismatched', text: 'other' })
  })

  it('compares and serves without the shebang Jest strips, keeping its empty line', () => {
    expect(
      switchSource(
        {
          switched: '#!/usr/bin/env node\na - b',
          original: '#!/usr/bin/env node\na + b',
          file: '/a.js',
        },
        '\na + b',
      ),
    ).toStrictEqual({ text: '\na - b', kind: 'served' })
  })

  it('takes a shebang only on the first line', () => {
    expect(
      switchSource(
        { original: 'a\n#!b', switched: 'c\n#!b', file: '/a.js' },
        'a\n#!b',
      ),
    ).toStrictEqual({ text: 'c\n#!b', kind: 'served' })
  })

  it('serves the switched text without the byte order mark a loader dropped', () => {
    let mark = String.fromCodePoint(0xfe_ff)

    expect(
      switchSource(
        { original: `${mark}a + b`, switched: `${mark}a - b`, file: '/a.js' },
        'a + b',
      ),
    ).toStrictEqual({ kind: 'served', text: 'a - b' })
  })
})
