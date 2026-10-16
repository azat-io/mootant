import { describe, expect, it } from 'vitest'
import { parse } from 'svelte/compiler'

import { collectSvelteExpressions } from '../../../core/parser/collect-svelte-expressions'

/**
 * Collects the template code of a component.
 *
 * @param lines - Lines of the component.
 * @returns Text and wrapper of every collected expression, and the text of
 *   every comment.
 */
function collect(lines: string[]): {
  expressions: string[][]
  comments: string[]
} {
  let source = lines.join('\n')
  let parts = collectSvelteExpressions(parse(source, { modern: true }))
  return {
    comments: parts.comments.map(comment => {
      expect(comment.type).toBe('Block')
      expect(source.slice(comment.start, comment.end)).toBe(
        `<!--${comment.value}-->`,
      )
      return comment.value
    }),
    expressions: parts.expressions.map(({ start, wrap, end }) => [
      source.slice(start, end),
      wrap,
    ]),
  }
}

describe('collectSvelteExpressions', () => {
  it('collects the expressions of tags and blocks in source order', () => {
    expect(
      collect([
        '<script>let { a, b, items } = $props()</script>',
        '{#if a > 1}{a + 1}{:else if !b}{@html b}{:else}z{/if}',
        '{#each items.slice(1) as { id, name = "n" }, i (id)}{name}{:else}-{/each}',
        '{#await load(a)}…{:then value}{value.x}{:catch error}{error.message}{/await}',
        '{#key a % 2}k{/key}',
        '{#snippet row(step = 1)}{step * 2}{/snippet}',
        '{@render row(a + 1)}{@render row?.(...items)}',
        '{#if a}{@const twice = a * 2}{twice}{/if}',
        '{let half = a / 2}',
        '{@debug a}',
      ]),
    ).toStrictEqual({
      expressions: [
        ['a > 1', 'condition'],
        ['a + 1', 'value'],
        ['!b', 'condition'],
        ['b', 'value'],
        ['items.slice(1)', 'value'],
        ['name', 'value'],
        ['load(a)', 'value'],
        ['value.x', 'value'],
        ['error.message', 'value'],
        ['a % 2', 'value'],
        ['step * 2', 'value'],
        ['a + 1', 'value'],
        ['items', 'value'],
        ['a', 'condition'],
        ['const twice = a * 2', 'declaration'],
        ['twice', 'value'],
        ['let half = a / 2', 'declaration'],
      ],
      comments: [],
    })
  })

  it('collects the expressions of attributes and directives', () => {
    expect(
      collect([
        '<script>let { a, b, c, rest, act } = $props()</script>',
        '<p title="x {a} {b ? "y" : \'z\'}" class:on={a > 1} class:b style:color={c} style:width="{a}px" style:top {c}></p>',
        '<input {...rest} bind:value={a} use:act={{ size: a }} onclick={() => a++} {@attach (node) => node.focus()} />',
        '<Comp let:item on:done={c} transition:fade={{ duration: a }} />',
        '<button on:click use:act>x</button>',
        '<svelte:element this={ (a ? "b" : "i") } />',
        '<svelte:element this="em" />',
        '<svelte:component this={a ?? b} />',
        '<svelte:options runes={true} />',
      ]),
    ).toStrictEqual({
      expressions: [
        ['a', 'value'],
        ['b ? "y" : \'z\'', 'value'],
        ['a > 1', 'condition'],
        ['c', 'value'],
        ['a', 'value'],
        ['rest', 'value'],
        ['{ size: a }', 'value'],
        ['() => a++', 'handler'],
        ['(node) => node.focus()', 'value'],
        ['c', 'handler'],
        ['{ duration: a }', 'value'],
        ['a ? "b" : "i"', 'value'],
        ['a ?? b', 'value'],
      ],
      comments: [],
    })
  })

  it('marks the handlers whose result is discarded', () => {
    expect(
      collect([
        '<script>let { a, Comp } = $props()</script>',
        '<svelte:window onkeydown={() => a++} />',
        '<button onclick="{() => a--}" title="t{a}" on:blur={() => a}>x</button>',
        '<p onclick="go {a}"></p>',
        '<Comp onchange={() => a++} on:done={() => a++} />',
      ]),
    ).toStrictEqual({
      expressions: [
        ['() => a++', 'handler'],
        ['() => a--', 'handler'],
        ['a', 'value'],
        ['() => a', 'handler'],
        ['a', 'value'],
        ['() => a++', 'value'],
        ['() => a++', 'handler'],
      ],
      comments: [],
    })
  })

  it('tells braced class directives and tags from shorthand and strings', () => {
    expect(
      collect([
        '<script>let { a, tag } = $props()</script>',
        '<p class:a class:on={/* why */ a > 1} class:off="{a > 2}"></p>',
        '<svelte:element this={/* c */ tag} />',
        '<svelte:element this={"div"} />',
        '<svelte:element this=div />',
      ]),
    ).toStrictEqual({
      expressions: [
        ['a > 1', 'condition'],
        ['a > 2', 'condition'],
        ['tag', 'value'],
        ['"div"', 'value'],
      ],
      comments: [],
    })
  })

  it('leaves out the list of an each block without as', () => {
    expect(collect(['{#each { length: 3 }, i}{i}{/each}'])).toStrictEqual({
      expressions: [['i', 'value']],
      comments: [],
    })
  })

  it('collects the HTML comments of the template', () => {
    expect(
      collect([
        '<script>let a = 1</script>',
        '<!-- mootant-ignore-next-line -->',
        '<p>{#if a}<!--inner-->{/if}</p>',
      ]),
    ).toStrictEqual({
      comments: [' mootant-ignore-next-line ', 'inner'],
      expressions: [['a', 'condition']],
    })
  })
})
