import { describe, expect, it } from 'vitest'
import * as vue from '@vue/compiler-dom'

import { parseVueTemplate } from '../../../core/parser/parse-vue-template'

describe('parseVueTemplate', () => {
  it('parses the expressions with the HTML comments as block comments', () => {
    let source = [
      '<script setup lang="ts">let a = 1</script>',
      '<template>',
      '  <!-- mootant-ignore-next-line -->',
      '  <p :title="(a as number) + 1">{{ a }}</p>',
      '</template>',
    ].join('\n')

    let outcome = parseVueTemplate(vue, { file: 'a.vue', lang: 'ts', source })
    let { expressions, parsed } = outcome as Extract<
      typeof outcome,
      { kind: 'parsed' }
    >

    expect(parsed.language).toBe('typescript')
    expect(
      expressions.map(expression =>
        source.slice(expression.start, expression.end),
      ),
    ).toStrictEqual(['(a as number) + 1', 'a'])
    expect(
      parsed.comments.map(comment => source.slice(comment.start, comment.end)),
    ).toStrictEqual(['<!-- mootant-ignore-next-line -->'])
  })

  it('reads the offsets of a file that starts with a byte order mark', () => {
    let source = `${String.fromCodePoint(0xfe_ff)}<template>{{ 12 }}</template>`

    let outcome = parseVueTemplate(vue, { file: 'a.vue', lang: 'js', source })
    let { parsed } = outcome as Extract<typeof outcome, { kind: 'parsed' }>

    expect(parsed.text.slice(14, 16)).toBe('12')
  })

  it('keeps the comments of a template without expressions', () => {
    let source = '<template><!-- mootant-ignore-file --><p>a</p></template>'
    let outcome = parseVueTemplate(vue, { file: 'a.vue', lang: 'js', source })
    let { parsed } = outcome as Extract<typeof outcome, { kind: 'parsed' }>

    expect(
      parsed.comments.map(comment => source.slice(comment.start, comment.end)),
    ).toStrictEqual(['<!-- mootant-ignore-file -->'])
  })

  it('gives nothing for a template without expressions', () => {
    expect(
      parseVueTemplate(vue, {
        source: '<template><p>text</p></template>',
        file: 'a.vue',
        lang: 'js',
      }),
    ).toStrictEqual({ kind: 'empty' })
  })

  it('warns at the problem when Vue rejects the file', () => {
    expect(
      parseVueTemplate(vue, {
        source: '<template>\n<p>{{ a </p></template>',
        file: 'a.vue',
        lang: 'js',
      }),
    ).toStrictEqual({
      diagnostic: {
        message:
          'The template is not mutated, because it does not parse: Interpolation end sign was not found.',
        code: 'template-skipped',
        severity: 'warning',
        file: 'a.vue',
        column: 4,
        line: 2,
      },
      kind: 'failed',
    })
  })

  it('warns without a position when the error has none', () => {
    let compiler = {
      ...vue,
      parse: () => {
        throw new Error('broken')
      },
    }

    expect(
      parseVueTemplate(compiler, {
        source: '<template />',
        file: 'a.vue',
        lang: 'js',
      }),
    ).toMatchObject({
      diagnostic: {
        message:
          'The template is not mutated, because it does not parse: broken',
        column: null,
        line: null,
      },
    })
  })
})
