import { describe, expect, it } from 'vitest'
import * as svelte from 'svelte/compiler'

import { parseSvelteTemplate } from '../../../core/parser/parse-svelte-template'

describe('parseSvelteTemplate', () => {
  it('parses the expressions with the HTML comments as block comments', () => {
    let source = [
      '<script lang="ts">let { a } = $props()</script>',
      '<!-- mootant-ignore-next-line -->',
      '<p>{(a as number) + /* note */ 1}</p>',
    ].join('\n')

    let outcome = parseSvelteTemplate(svelte, {
      file: 'a.svelte',
      lang: 'ts',
      source,
    })
    expect(outcome.kind).toBe('parsed')

    let { parsed, hosts } = outcome as Extract<
      typeof outcome,
      { kind: 'parsed' }
    >

    expect(parsed.language).toBe('typescript')
    expect(
      parsed.comments.map(comment => source.slice(comment.start, comment.end)),
    ).toStrictEqual(['<!-- mootant-ignore-next-line -->', '/* note */'])
    expect([...parsed.commentEnds]).toStrictEqual(
      parsed.comments.map(comment => [comment.start, comment.end]),
    )
    expect(hosts.has(parsed.program)).toBe(true)
  })

  it('reads the offsets of a file that starts with a byte order mark', () => {
    let source = `${String.fromCodePoint(0xfe_ff)}<p>{ 12 }</p><!-- c -->`

    let outcome = parseSvelteTemplate(svelte, {
      file: 'a.svelte',
      lang: 'js',
      source,
    })
    let { parsed } = outcome as Extract<typeof outcome, { kind: 'parsed' }>

    expect(parsed.text.slice(6, 8)).toBe('12')
    expect(
      parsed.comments.map(comment => source.slice(comment.start, comment.end)),
    ).toStrictEqual(['<!-- c -->'])
  })

  it('gives the event handlers whose result is discarded', () => {
    let source = '<button onclick={() => count++}>{count}</button>'

    let outcome = parseSvelteTemplate(svelte, {
      file: 'a.svelte',
      lang: 'js',
      source,
    })
    let { handlers } = outcome as Extract<typeof outcome, { kind: 'parsed' }>

    expect(
      [...handlers].map(node => source.slice(node.start, node.end)),
    ).toStrictEqual(['() => count++'])
  })

  it('gives nothing for a template without expressions and comments', () => {
    expect(
      parseSvelteTemplate(svelte, {
        source: '<p>text</p>',
        file: 'a.svelte',
        lang: 'js',
      }),
    ).toStrictEqual({ kind: 'empty' })
  })

  it('keeps the comments of a template without expressions', () => {
    let source = '<p>text</p><!-- c -->'
    let outcome = parseSvelteTemplate(svelte, {
      file: 'a.svelte',
      lang: 'js',
      source,
    })
    let { parsed } = outcome as Extract<typeof outcome, { kind: 'parsed' }>

    expect(
      parsed.comments.map(comment => source.slice(comment.start, comment.end)),
    ).toStrictEqual(['<!-- c -->'])
  })

  it('warns at the problem when Svelte rejects the file', () => {
    expect(
      parseSvelteTemplate(svelte, {
        source: '<p>\n{#if a}</p>',
        file: 'a.svelte',
        lang: 'js',
      }),
    ).toStrictEqual({
      diagnostic: {
        message:
          'The template is not mutated, because it does not parse: `</p>` attempted to close an element that was not open https://svelte.dev/e/element_invalid_closing_tag',
        code: 'template-skipped',
        severity: 'warning',
        file: 'a.svelte',
        column: 8,
        line: 2,
      },
      kind: 'failed',
    })
  })

  it('warns without a position when the error has none', () => {
    let compiler = {
      ...svelte,
      parse: () => {
        throw new Error('broken')
      },
    }

    expect(
      parseSvelteTemplate(compiler, {
        file: 'a.svelte',
        source: '<p />',
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

  it('warns when oxc rejects an expression that Svelte accepts', () => {
    let source = '<script lang="ts"></script>\n<p>{a as number}</p>'

    expect(
      parseSvelteTemplate(svelte, {
        file: 'a.svelte',
        lang: 'js',
        source,
      }),
    ).toMatchObject({
      diagnostic: { code: 'template-skipped', column: 5, line: 2 },
      kind: 'failed',
    })
  })
})
