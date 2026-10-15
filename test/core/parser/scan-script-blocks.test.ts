import { describe, expect, it } from 'vitest'

import type { ComponentFramework } from '../../../types/source/component-framework'
import type { ScriptBlock } from '../../../types/source/script-block'

import { scanScriptBlocks } from '../../../core/parser/scan-script-blocks'

/**
 * Block as a test reads it: its text instead of its offsets.
 */
interface ReadBlock {
  /**
   * Language of the block.
   */
  lang: ScriptBlock['lang']

  /**
   * Whether the block is an Astro frontmatter.
   */
  frontmatter: boolean

  /**
   * Text of the block.
   */
  text: string
}

/**
 * Scans a component and reads the text of its blocks.
 *
 * @param lines - Lines of the component, joined with line feeds.
 * @param framework - Framework of the component.
 * @returns Blocks with their texts.
 */
function scan(lines: string[], framework: ComponentFramework): ReadBlock[] {
  let source = lines.join('\n')
  return scanScriptBlocks(source, framework).map(block => ({
    text: source.slice(block.start, block.end),
    frontmatter: block.frontmatter,
    lang: block.lang,
  }))
}

/**
 * Builds the expected script block of a test.
 *
 * @param text - Text of the block.
 * @param lang - Language of the block; JavaScript when omitted.
 * @returns Script block that is not a frontmatter.
 */
function script(text: string, lang: ScriptBlock['lang'] = 'js'): ReadBlock {
  return { frontmatter: false, lang, text }
}

describe('scanScriptBlocks', () => {
  it.each([
    {
      lines: [
        '<template><p>{{ a }}</p></template>',
        '<script>export default {}</script>',
        '<script setup lang="ts">let a = 1</script>',
        '<style>p > a { color: red }</style>',
      ],
      blocks: [script('export default {}'), script('let a = 1', 'ts')],
      name: 'a script and a script setup',
    },
    {
      lines: [
        "<script lang='tsx' setup>let a = <b />;</script>",
        '<script setup lang=jsx>let c = <d />;</script>',
        '<script lang=" TS ">let e = 1</script>',
      ],
      blocks: [
        script('let a = <b />;', 'tsx'),
        script('let c = <d />;', 'jsx'),
        script('let e = 1', 'ts'),
      ],
      name: 'attributes in any order and quoting',
    },
    {
      lines: [
        '<script lang="javascript">a</script>',
        '<script lang="typescript">b</script>',
        '<script lang="js">c</script>',
        '<script lang>d</script>',
        '<script lang="coffee">e</script>',
      ],
      blocks: [script('a'), script('b', 'ts'), script('c'), script('d')],
      name: 'languages, skipping an unknown one',
    },
    {
      lines: [
        '<script src="./a.js"></script>',
        '<script SRC=./b.js>let b = 1</script>',
        '<script type="application/json">{"a": 1}</script>',
        '<script type="text/template"><p>{{ a }}</p></script>',
        '<script type="application/ld+json">{}</script>',
        '<script type="module">let c = 1</script>',
        '<script type="text/javascript">let d = 1</script>',
        '<script type="TEXT/TYPESCRIPT" lang="ts">let e = 1</script>',
        '<script type="">let f = 1</script>',
      ],
      blocks: [
        script('let c = 1'),
        script('let d = 1'),
        script('let e = 1', 'ts'),
        script('let f = 1'),
      ],
      name: 'external and non-JavaScript scripts skipped',
    },
    {
      lines: [
        '<script type="text/typescript">let a: number = 1</script>',
        '<script type="Application/TypeScript">let b: number = 1</script>',
        '<script type=" ts ">let c: number = 1</script>',
        '<script type="ts" lang="tsx">let d = <e /></script>',
      ],
      blocks: [
        script('let a: number = 1', 'ts'),
        script('let b: number = 1', 'ts'),
        script('let c: number = 1', 'ts'),
        script('let d = <e />', 'tsx'),
      ],
      name: 'TypeScript from the type without a lang',
    },
    {
      lines: [
        '<!-- <script>let a = 1</script> -->',
        '<!-- unterminated <script>let b = 1</script>',
      ],
      name: 'scripts inside HTML comments skipped',
      blocks: [],
    },
    {
      lines: [
        '<SCRIPT LANG="TS">let a = 1</Script >',
        '<Script>let b = "</scrip"</SCRIPT>',
      ],
      blocks: [script('let a = 1', 'ts'), script('let b = "</scrip"')],
      name: 'uppercase tags',
    },
    {
      lines: [
        '<template>',
        '  <p :title="\'</script>\'">{{ "<script>let x = 1</script>" }}</p>',
        '  <script>let y = 1</script>',
        '  <template v-if="a"><i>b</i></template>',
        '</template>',
        '<script>let z = "</script>"</script>',
      ],
      name: 'script tags in the template and in a script string',
      blocks: [script('let z = "')],
    },
    {
      lines: [
        '<docs>Use <script>let a = 1</script> here.</docs>',
        '<i18n lang="json">{}</i18n>',
        '<script>let b = 1</script>',
      ],
      name: 'custom blocks read as raw text',
      blocks: [script('let b = 1')],
    },
    {
      lines: ['<script></script>', '<script setup />', '<template />'],
      name: 'empty and self-closing scripts',
      blocks: [script('')],
    },
    {
      lines: ['<template><p>Nothing to run</p></template>', '<style></style>'],
      name: 'a component without scripts',
      blocks: [],
    },
    {
      name: 'an unterminated script up to the end',
      lines: ['<script>let a = 1', '</template>'],
      blocks: [script('let a = 1\n</template>')],
    },
    {
      name: 'an empty script for an unterminated tag',
      lines: ['<script', 'setup'],
      blocks: [script('')],
    },
  ])('finds $name in Vue', ({ blocks, lines }) => {
    expect(scan(lines, 'vue')).toStrictEqual(blocks)
  })

  it.each([
    {
      lines: [
        '<script context="module">export let a = 1</script>',
        '<script module>export let b = 1</script>',
        '<script lang="ts" generics="T extends { a: 1 }">let c: T</script>',
        '<p>{c}</p>',
      ],
      blocks: [
        script('export let a = 1'),
        script('export let b = 1'),
        script('let c: T', 'ts'),
      ],
      name: 'module and instance scripts',
    },
    {
      lines: [
        `<div on:click={() => a > b} {...rest} title={\`\${"<script>"}\`}>`,
        '  <script>let a = 1</script>',
        '</div>',
        '{#if a}<script>let b = 1</script>{/if}',
        '{#each items as item}{item}{:else}<br>{/each}',
        '<svelte:head><script>let c = 1</script></svelte:head>',
        '<img src="a.png"><input /><Comp prop={1} />',
        "{'<script>let d = 1</script>' /* } */ // }",
        '}',
        '<script>let e = 1</script>',
      ],
      name: 'only top-level scripts',
      blocks: [script('let e = 1')],
    },
    {
      lines: [
        '<ul><li>a<li>b</ul>',
        '</section>',
        String.raw`{"\"}" + '\''}`,
        '<script>let a = 1</script>',
      ],
      name: 'scripts after omitted and stray closing tags',
      blocks: [script('let a = 1')],
    },
    {
      lines: [`<p>{\`a\${b}`, '<script>let c = 1</script>'],
      name: 'nothing after an unterminated expression',
      blocks: [],
    },
    {
      lines: [
        `<p title={{ a: 1 }.a}>{ { b: \`c\\\`\${d}\` }.b }</p>`,
        '<script lang="ts" lang="tsx">let e = 1</script>',
        '<',
      ],
      name: 'the first of repeated attributes after nested braces',
      blocks: [script('let e = 1', 'ts')],
    },
    {
      lines: ['<p>{"a', '<script>let c = 1</script>'],
      name: 'nothing after an unterminated string',
      blocks: [],
    },
    {
      lines: [
        "<p>{name.replace(/'/g, '')}{a.split( /[/}`]/ )}</p>",
        '<p title={[/"/, !/`/]} {...{ a: typeof /{/ }}>{x ? /\\/\'/ : 1}</p>',
        "{#if /'/.test(a)}{:else if b}{/if}{#each list as item}{/each}",
        "{@html /'/i.source}{a / b / c}{a + /'/.source}{1 / 2 + '}'}",
        '{b = /',
        '2}{a',
        '/ 1 }',
        '<script>let c = 1</script>',
      ],
      name: 'top-level scripts after regular expressions and divisions',
      blocks: [script('let c = 1')],
    },
    {
      lines: [
        '<p>Hello',
        '<div>world</div>',
        '<p>a<P>b<hr><table><tr><td>c<td>d<tr><th>e</table>',
        '<ul><li>f<li>g</ul><dl><dt>h<dd>i</dl>',
        '<select><optgroup><option>j<option>k<optgroup></select>',
        '<p>l<section></section>',
        '<script>let m = 1</script>',
      ],
      name: 'top-level scripts after elements closed by a following tag',
      blocks: [script('let m = 1')],
    },
    {
      lines: [
        '<p>Hello <span>a<div>b</div></span>',
        '<script>let c = 1</script>',
        '<p><script>let d = 1</script>',
      ],
      name: 'no scripts inside elements a tag does not close',
      blocks: [],
    },
  ])('finds $name in Svelte', ({ blocks, lines }) => {
    expect(scan(lines, 'svelte')).toStrictEqual(blocks)
  })

  it.each([
    {
      lines: [
        '---',
        "import Layout from './Layout.astro'",
        'const a = 1',
        '---',
        '<Layout title={a > 0 ? "<script>" : ""}>',
        '  <script>let b: number = 1</script>',
        '  <div><script is:inline>let c = 1</script></div>',
        '  <script type="module">let d = 1</script>',
        '  <script lang="ts" is:inline>let e = 1</script>',
        '  <!-- <script>let f = 1</script> -->',
        '</Layout>',
      ],
      blocks: [
        {
          text: "import Layout from './Layout.astro'\nconst a = 1\n",
          frontmatter: true,
          lang: 'ts',
        },
        script('let b: number = 1', 'ts'),
        script('let c = 1'),
        script('let d = 1'),
        script('let e = 1', 'ts'),
      ],
      name: 'the frontmatter and every script',
    },
    {
      blocks: [{ frontmatter: true, lang: 'ts', text: '' }],
      name: 'an empty frontmatter after blank lines',
      lines: ['', '  ---  ', '---', '<p>a</p>'],
    },
    {
      lines: ['---', 'const a = 1', '<script>let b = 1</script>'],
      name: 'no frontmatter without a closing fence',
      blocks: [script('let b = 1', 'ts')],
    },
    {
      lines: ['<p>---</p>', '---', '<script>let a = 1</script>'],
      blocks: [script('let a = 1', 'ts')],
      name: 'no frontmatter after markup',
    },
    {
      lines: ['--- const a = 1 ---', '<p>{a}</p>'],
      name: 'no frontmatter on the fence line',
      blocks: [],
    },
  ])('finds $name in Astro', ({ blocks, lines }) => {
    expect(scan(lines, 'astro')).toStrictEqual(blocks)
  })

  it('reports offsets of the file with CRLF line endings', () => {
    let source = [
      '---',
      'let a = 1',
      '---',
      '<script>',
      'let b = 2',
      '</script>',
    ].join('\r\n')

    expect(scanScriptBlocks(source, 'astro')).toStrictEqual([
      { frontmatter: true, lang: 'ts', start: 5, end: 16 },
      { frontmatter: false, lang: 'ts', start: 29, end: 42 },
    ])
    expect(source.slice(5, 16)).toBe('let a = 1\r\n')
    expect(source.slice(29, 42)).toBe('\r\nlet b = 2\r\n')
  })
})
