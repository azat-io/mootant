import { describe, expect, it } from 'vitest'

import { readTemplateProgram } from '../../../core/parser/read-template-program'

describe('readTemplateProgram', () => {
  it('parses the expressions and merges the HTML comments in order', () => {
    let source = '<!-- a --><p>{{ x /* b */ }}</p><!-- c -->'
    let outcome = readTemplateProgram(
      { file: 'a.vue', lang: 'js', source },
      {
        comments: [
          { type: 'Block', value: ' a ', start: 0, end: 10 },
          { type: 'Block', value: ' c ', start: 32, end: 42 },
        ],
        expressions: [{ wrap: 'value', start: 16, end: 25 }],
      },
    )
    let { expressions, parsed } = outcome as Extract<
      typeof outcome,
      { kind: 'parsed' }
    >

    expect(expressions).toStrictEqual([{ wrap: 'value', start: 16, end: 25 }])
    expect(
      parsed.comments.map(comment => source.slice(comment.start, comment.end)),
    ).toStrictEqual(['<!-- a -->', '/* b */', '<!-- c -->'])
    expect([...parsed.commentEnds]).toStrictEqual([
      [0, 10],
      [18, 25],
      [32, 42],
    ])
  })

  it('keeps the HTML comments of a template without expressions', () => {
    let source = '<p>a</p>\n<!-- mootant-ignore-file -->'
    let outcome = readTemplateProgram(
      { file: 'a.vue', lang: 'ts', source },
      {
        comments: [
          { value: ' mootant-ignore-file ', type: 'Block', start: 9, end: 37 },
        ],
        expressions: [],
      },
    )
    let { expressions, handlers, parsed } = outcome as Extract<
      typeof outcome,
      { kind: 'parsed' }
    >

    expect(expressions).toStrictEqual([])
    expect(handlers).toStrictEqual(new Set())
    expect(parsed.program.body).toStrictEqual([])
    expect(parsed.language).toBe('typescript')
    expect(parsed.text).toBe(`${' '.repeat(8)}\n${' '.repeat(28)}`)
    expect(parsed.lineStarts).toStrictEqual([0, 9])
    expect([...parsed.commentEnds]).toStrictEqual([[9, 37]])
  })

  it('gives nothing without expressions and comments', () => {
    expect(
      readTemplateProgram(
        { source: '<p />', file: 'a.vue', lang: 'js' },
        { expressions: [], comments: [] },
      ),
    ).toStrictEqual({ kind: 'empty' })
  })

  it('warns when oxc rejects an expression', () => {
    expect(
      readTemplateProgram(
        { source: '<p>{{ a b }}</p>', file: 'a.vue', lang: 'js' },
        { expressions: [{ wrap: 'value', start: 6, end: 9 }], comments: [] },
      ),
    ).toMatchObject({
      diagnostic: { code: 'template-skipped', column: 9, line: 1 },
      kind: 'failed',
    })
  })
  it('keeps the HTML comments when oxc rejects an expression', () => {
    let source = '<!-- mootant-ignore-file --><p>{{ a b }}</p>'
    let outcome = readTemplateProgram(
      { file: 'a.vue', lang: 'js', source },
      {
        comments: [
          { value: ' mootant-ignore-file ', type: 'Block', start: 0, end: 28 },
        ],
        expressions: [{ wrap: 'value', start: 34, end: 37 }],
      },
    )
    let { expressions, diagnostic, parsed } = outcome as Extract<
      typeof outcome,
      { kind: 'parsed' }
    >

    expect(diagnostic).toMatchObject({
      code: 'template-skipped',
      column: 37,
      line: 1,
    })
    expect(expressions).toStrictEqual([])
    expect(parsed.program.body).toStrictEqual([])
    expect(parsed.text).toBe(' '.repeat(source.length))
    expect([...parsed.commentEnds]).toStrictEqual([[0, 28]])
  })

  it('gives no warning when the expressions parse', () => {
    let outcome = readTemplateProgram(
      { source: '<p>{{ a }}</p>', file: 'a.vue', lang: 'js' },
      { expressions: [{ wrap: 'value', start: 6, end: 7 }], comments: [] },
    )

    expect(outcome).not.toHaveProperty('diagnostic')
  })
})
