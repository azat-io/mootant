import type { Node } from 'oxc-parser'

import { describe, expect, it } from 'vitest'
import * as svelte from 'svelte/compiler'
import * as vue from '@vue/compiler-dom'

import type { BindingClosure } from '../../../types/syntax/binding-closure'
import type { ScopeAnalysis } from '../../../types/syntax/scope-analysis'

import { parseComponentTemplate } from '../../../core/parser/parse-component-template'
import { getBindingClosure } from '../../../core/syntax/get-binding-closure'
import { getSharedScopes } from '../../../core/parser/get-shared-scopes'
import { getSourceBlocks } from '../../../core/parser/get-source-blocks'
import { analyzeScopes } from '../../../core/hints/analyze-scopes'
import { parseFile } from '../../../core/parser/parse-file'

/**
 * Program of a file with what getBindingClosure reads of it.
 */
interface AnalyzedProgram {
  /**
   * Scopes of the program whose names code outside it may read and write.
   */
  shared: ReadonlySet<Node>

  /**
   * Scope analysis of the program.
   */
  scopes: ScopeAnalysis
}

/**
 * Analyzes the scopes of every program of a file, as generateFileMutants splits
 * it: the whole text of a JavaScript or TypeScript file, or every script block
 * and the template of a component. A program that does not parse fails the
 * test.
 *
 * @param file - Path of the file, whose extension tells the framework.
 * @param source - Text of the file.
 * @returns Scope analysis and shared scopes of every program, the template
 *   last.
 * @throws Error - When a program does not parse.
 */
function analyzePrograms(file: string, source: string): AnalyzedProgram[] {
  let programs = getSourceBlocks(file, source).map(block => {
    let outcome = parseFile(file, block.text, block)
    if (outcome.kind === 'failed') {
      throw new Error(`A script block of ${file} does not parse.`)
    }
    let { program } = outcome.parsed
    return {
      shared: getSharedScopes(file, program, null),
      scopes: analyzeScopes(program),
    }
  })
  let template = parseComponentTemplate(
    { svelte, vue },
    { lang: 'js', source, file },
  )
  if (template.kind === 'failed') {
    throw new Error(`The template of ${file} does not parse.`)
  }
  if (template.kind === 'parsed') {
    let { program } = template.parsed
    programs.push({
      shared: getSharedScopes(file, program, template.expressions),
      scopes: analyzeScopes(program),
    })
  }
  return programs
}

/**
 * Tells the closure of the binding that declares the name `n` in a file.
 *
 * @param file - Path of the file, whose extension tells the framework.
 * @param source - Text of the file, which declares `n` once.
 * @returns Closure of the binding in the program that declares it.
 * @throws Error - When no program declares `n`.
 */
function getClosure(file: string, source: string): BindingClosure {
  for (let { scopes, shared } of analyzePrograms(file, source)) {
    for (let binding of scopes.bindings.values()) {
      if (
        binding.identifier.type === 'Identifier' &&
        binding.identifier.name === 'n'
      ) {
        return getBindingClosure(scopes, shared, binding)
      }
    }
  }
  throw new Error(`No program of ${file} declares n.`)
}

describe('getBindingClosure', () => {
  it.each([
    { title: 'a module const', source: 'const n = 1', file: 'a.ts' },
    { title: 'a written module let', source: 'let n = 1; n++', file: 'a.ts' },
    {
      source: 'function f() { let n = 1 }',
      title: 'a function local',
      file: 'a.ts',
    },
    {
      source: 'let n = 1; export { n }',
      title: 'a let exported by name',
      file: 'a.ts',
    },
    {
      source: 'let n = 1; export default n',
      title: 'a let exported as default',
      file: 'a.ts',
    },
    {
      source: 'let n = 1; export let m = n',
      title: 'a let beside an export',
      file: 'a.ts',
    },
    {
      source: 'export let m = 1; function n() {}',
      title: 'a function beside an export',
      file: 'a.ts',
    },
    {
      source: 'namespace N { let n = 1 }',
      title: 'a namespace let',
      file: 'a.ts',
    },
    {
      title: 'a let of a Svelte module file',
      source: 'let n = $state(0)',
      file: 'store.svelte.ts',
    },
  ])('finds $title closed', ({ source, file }) => {
    expect(getClosure(file, source)).toBe('closed')
  })

  it.each([
    'export let n = 1',
    'export const n = 1',
    'export var n = 1',
    'export const { n } = o',
    'export let m = 0, n = 1',
    'export function n() {}',
    'export class n {}',
    'export default function n() {}',
    'export default class n {}',
    'export enum n {}',
    'namespace N { export function n() {} }',
  ])('finds the binding of %s write-closed', source => {
    expect(getClosure('example.ts', source)).toBe('write-closed')
  })

  it.each([
    'namespace N { export let n = 1 }',
    'namespace N { export var n = 1 }',
    'namespace N { export const n = 1 }',
  ])('finds the binding of %s open', source => {
    expect(getClosure('example.ts', source)).toBe('open')
  })

  it.each([
    { source: 'const n = 1; eval(code)', title: 'a direct eval', file: 'a.ts' },
    {
      source: 'export const n = 1; eval(code)',
      title: 'a direct eval and an export',
      file: 'a.ts',
    },
    {
      source: 'function f() { let n = 1; with (o) { n } }',
      title: 'a with statement',
      file: 'a.js',
    },
    {
      source: '<script>function f() { let n = 1; eval(code) }</script>',
      title: 'a direct eval in a component',
      file: 'Card.svelte',
    },
  ])(
    'finds every binding of a program with $title open',
    ({ source, file }) => {
      expect(getClosure(file, source)).toBe('open')
    },
  )

  it.each([
    {
      source: '<script>\n  export let n = 0\n</script>\n<p>{n}</p>',
      title: 'a Svelte prop',
      file: 'Card.svelte',
      expected: 'open',
    },
    {
      source: '<script>let n = 0</script>\n<button on:click={() => n++} />',
      title: 'a Svelte instance let',
      file: 'Card.svelte',
      expected: 'open',
    },
    {
      source:
        '<script context="module">let n = 0</script>\n<script>n++</script>',
      title: 'a Svelte module let that the instance writes',
      file: 'Card.svelte',
      expected: 'open',
    },
    {
      source: '<script>function n() {}</script>',
      title: 'a Svelte instance function',
      file: 'Card.svelte',
      expected: 'open',
    },
    {
      source: '<script>const n = 0</script>',
      title: 'a Svelte instance const',
      expected: 'write-closed',
      file: 'Card.svelte',
    },
    {
      source: '<script>const { n } = $props()</script>\n<p>{n}</p>',
      title: 'a Svelte prop destructured into a const',
      file: 'Card.svelte',
      expected: 'open',
    },
    {
      source:
        "<script>let { s } = $props()</script>\n{let n = s.indexOf(':')}\n<button onclick={() => (n = -5)}>x</button>",
      title: 'a let of a Svelte declaration tag that the template writes',
      file: 'Card.svelte',
      expected: 'open',
    },
    {
      title: 'a const of a Svelte declaration tag',
      source: '{const n = s.length}\n<p>{n}</p>',
      expected: 'write-closed',
      file: 'Card.svelte',
    },
    {
      source: '{#if s}{@const n = s.length}<p>{n}</p>{/if}',
      title: 'a Svelte const tag',
      expected: 'write-closed',
      file: 'Card.svelte',
    },
    {
      source: '{const f = () => { let n = 0; return n }}\n<p>{f()}</p>',
      title: 'a function local of a Svelte declaration tag',
      file: 'Card.svelte',
      expected: 'closed',
    },
    {
      source: '<script module>const n = 0</script>',
      title: 'a Svelte module const',
      expected: 'write-closed',
      file: 'Card.svelte',
    },
    {
      source: '<script>function f() { let n = 0 }</script>',
      title: 'a function local of a Svelte instance',
      file: 'Card.svelte',
      expected: 'closed',
    },
    {
      source: '<script>let n = 0</script>\n<script setup>n++</script>',
      title: 'a Vue script let that the setup script writes',
      expected: 'open',
      file: 'App.vue',
    },
    {
      source:
        '<script setup>let n = 0</script>\n<template><i @click="n = 5" /></template>',
      title: 'a Vue script setup let that the template writes',
      expected: 'open',
      file: 'App.vue',
    },
    {
      source: '<script setup>const n = 0</script>',
      title: 'a Vue script setup const',
      expected: 'write-closed',
      file: 'App.vue',
    },
    {
      source: "<script setup>const { n } = defineProps(['n'])</script>",
      title: 'a Vue prop destructured into a const',
      expected: 'open',
      file: 'App.vue',
    },
    {
      source: '<script setup>function f() { let n = 0 }</script>',
      title: 'a function local of a Vue script setup',
      expected: 'closed',
      file: 'App.vue',
    },
    {
      source: '<template><button @click="var n = 0">x</button></template>',
      title: 'a var of a Vue template handler',
      expected: 'open',
      file: 'App.vue',
    },
    {
      source:
        '<template><button @click="let n = 0; go(n)">x</button></template>',
      title: 'a let of a Vue template handler',
      expected: 'closed',
      file: 'App.vue',
    },
    {
      source: '---\nlet n = 0\n---\n<p>{n}</p>',
      title: 'an Astro frontmatter let',
      file: 'Page.astro',
      expected: 'open',
    },
    {
      source: '---\nconst n = 0\n---\n<p>{n}</p>',
      title: 'an Astro frontmatter const',
      expected: 'write-closed',
      file: 'Page.astro',
    },
    {
      title: 'a function local of an Astro frontmatter',
      source: '---\nfunction f() { let n = 0 }\n---',
      file: 'Page.astro',
      expected: 'closed',
    },
  ])('finds $title $expected', ({ expected, source, file }) => {
    expect(getClosure(file, source)).toBe(expected)
  })
})
