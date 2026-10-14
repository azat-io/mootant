import { describe, expect, it } from 'vitest'

import { getSourceBlocks } from '../../../core/parser/get-source-blocks'

/**
 * Byte order mark that may start a file.
 */
const BYTE_ORDER_MARK = String.fromCodePoint(0xfe_ff)

describe('getSourceBlocks', () => {
  it.each([
    ['src/a.ts', { sourceType: 'unambiguous', lang: 'ts' }],
    ['src/a.cjs', { sourceType: 'commonjs', lang: 'jsx' }],
  ])('keeps the whole text of %s as one program', (file, options) => {
    let source = '#!/usr/bin/env node\nlet a = 1'

    expect(getSourceBlocks(file, source)).toStrictEqual([
      { length: source.length, topLevelReturn: false, text: source, options },
    ])
  })

  it('blanks everything around each script block of a component', () => {
    let source = [
      '<template>',
      '  <p>{{ a + 1 }}</p>',
      '</template>',
      '<script>export default {}</script>',
      '<script setup lang="ts">',
      'let a = 1',
      '</script>',
    ].join('\n')

    expect(getSourceBlocks('src/App.vue', source)).toStrictEqual([
      {
        text: [
          ' '.repeat(10),
          ' '.repeat(20),
          ' '.repeat(11),
          `${' '.repeat(8)}export default {}${' '.repeat(9)}`,
          ' '.repeat(24),
          ' '.repeat(9),
          ' '.repeat(9),
        ].join('\n'),
        options: { sourceType: 'module', lang: 'js' },
        topLevelReturn: false,
        length: 69,
      },
      {
        text: [
          ' '.repeat(10),
          ' '.repeat(20),
          ' '.repeat(11),
          ' '.repeat(34),
          ' '.repeat(24),
          'let a = 1',
          ' '.repeat(9),
        ].join('\n'),
        options: { sourceType: 'module', lang: 'ts' },
        topLevelReturn: false,
        length: 114,
      },
    ])
  })

  it('keeps line terminators, a byte order mark and the length of surrogate pairs', () => {
    let source = `${BYTE_ORDER_MARK}<p>😀\r\u{2028}\u{2029}</p>\r\n<script>let a = '😀'</script>`

    let [block] = getSourceBlocks('src/Card.svelte', source)

    expect(block!.text).toBe(
      `${BYTE_ORDER_MARK}     \r\u{2028}\u{2029}    \r\n        let a = '😀'         `,
    )
    expect(block!.text).toHaveLength(source.length)
  })

  it('accepts a top-level return in an Astro frontmatter only', () => {
    let source = ['---', 'return 1', '---', '<script>let a = 1</script>'].join(
      '\n',
    )

    expect(
      getSourceBlocks('src/index.astro', source).map(block => [
        block.topLevelReturn,
        block.options.lang,
      ]),
    ).toStrictEqual([
      [true, 'ts'],
      [false, 'ts'],
    ])
  })

  it('returns no program for a component without scripts', () => {
    expect(getSourceBlocks('src/App.vue', '<template />')).toStrictEqual([])
  })
})
