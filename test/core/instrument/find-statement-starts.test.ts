import { describe, expect, it } from 'vitest'
import * as svelte from 'svelte/compiler'
import * as vue from '@vue/compiler-dom'

import { findStatementStarts } from '../../../core/instrument/find-statement-starts'

/**
 * Byte order mark at the start of a text read as UTF-8.
 */
const BYTE_ORDER_MARK = String.fromCodePoint(0xfe_ff)

describe('findStatementStarts', () => {
  it('finds expression statements of statement lists', () => {
    let source = ['let a = 1', 'run()', 'if (a) go()', '{ stop() }'].join('\n')

    expect([...findStatementStarts('example.ts', source)]).toStrictEqual([
      [source.indexOf('run()'), ';'],
      [source.indexOf('stop()'), ';'],
    ])
  })

  it('finds the statements of every script block of a component', () => {
    let source = [
      '<script>',
      'run()',
      '</script>',
      '<script setup>',
      'go()',
      '</script>',
    ].join('\n')

    expect([...findStatementStarts('Example.vue', source)]).toStrictEqual([
      [source.indexOf('run()'), ';'],
      [source.indexOf('go()'), ';'],
    ])
  })

  it('counts offsets after a byte order mark', () => {
    expect([
      ...findStatementStarts('example.ts', `${BYTE_ORDER_MARK}run()`),
    ]).toStrictEqual([[1, ';']])
  })

  it('throws when the text does not parse', () => {
    expect(() => findStatementStarts('example.ts', 'let =')).toThrow(
      'The original text of example.ts does not parse.',
    )
  })

  it('finds the statements of a template with the compilers', () => {
    let vueSource = [
      '<script setup lang="ts">run()</script>',
      '<template><p @click="go(1); n++" :a="f(() => { b() })">{{ c }}</p></template>',
    ].join('\n')
    let svelteSource = '<button onclick={() => { a()\n  b++ }}>{c}</button>'
    let compilers = { svelte, vue }

    expect([
      ...findStatementStarts('Example.vue', vueSource, compilers),
    ]).toStrictEqual([
      [vueSource.indexOf('run()'), ';'],
      [vueSource.indexOf('n++'), '{}'],
    ])
    expect([
      ...findStatementStarts('Example.svelte', svelteSource, compilers),
    ]).toStrictEqual([
      [svelteSource.indexOf('a()'), ';'],
      [svelteSource.indexOf('b++'), ';'],
    ])
    expect([
      ...findStatementStarts('Example.vue', '<template><p /></template>', {
        svelte: null,
        vue,
      }),
    ]).toStrictEqual([])
  })

  it('guards only the later statements of a Vue template with a block', () => {
    let source = [
      '<template>',
      '  <button @click="ready && save()" @focus="function () { a()',
      '    b++ }" @blur="async () => { c()',
      '    d++ }"></button>',
      '</template>',
    ].join('\n')

    expect([
      ...findStatementStarts('Example.vue', source, { svelte: null, vue }),
    ]).toStrictEqual([
      [source.indexOf('b++'), '{}'],
      [source.indexOf('d++'), '{}'],
    ])
  })
})
