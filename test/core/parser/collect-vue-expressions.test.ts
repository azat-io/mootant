import { describe, expect, it } from 'vitest'
import { parse } from '@vue/compiler-dom'

import { collectVueExpressions } from '../../../core/parser/collect-vue-expressions'

/**
 * Collects the template code of a component.
 *
 * @param lines - Lines of the component.
 * @returns Text, wrapper and delimiter of every collected expression, and the
 *   text of every comment.
 */
function collect(lines: string[]): {
  expressions: (undefined | string)[][]
  comments: string[]
} {
  let source = lines.join('\n')
  let parts = collectVueExpressions(
    parse(source, { parseMode: 'sfc', comments: true }),
    source,
  )
  return {
    comments: parts.comments.map(comment => {
      expect(comment.type).toBe('Block')
      expect(source.slice(comment.start, comment.end)).toBe(
        `<!--${comment.value}-->`,
      )
      return comment.value
    }),
    expressions: parts.expressions.map(({ delimiter, start, wrap, end }) => [
      source.slice(start, end),
      wrap,
      delimiter,
    ]),
  }
}

describe('collectVueExpressions', () => {
  it('collects interpolations and directives in source order', () => {
    expect(
      collect([
        '<script setup>let a = 1</script>',
        '<template>',
        '  <div :class="{ on: a > 1 }" v-if="a > 0" :title=\'a ? "x" : "y"\'>',
        '    {{ a + 1 }}',
        '    <p v-else-if="!a" v-show="a < 3" v-html="b" v-focus:x.y="a * 2">',
        '      <!-- mootant-ignore-next-line -->',
        '      {{ a - 1 }}',
        '    </p>',
        '    <Comp v-bind="props" v-on="listeners" :[name]="a % 2" />',
        '  </div>',
        '</template>',
        '<style>p { color: red }</style>',
      ]),
    ).toStrictEqual({
      expressions: [
        ['{ on: a > 1 }', 'value', '"'],
        ['a > 0', 'condition', '"'],
        ['a ? "x" : "y"', 'value', "'"],
        ['a + 1', 'value', '}}'],
        ['!a', 'condition', '"'],
        ['a < 3', 'condition', '"'],
        ['b', 'value', '"'],
        ['a * 2', 'value', '"'],
        ['a - 1', 'value', '}}'],
        ['props', 'value', '"'],
        ['listeners', 'value', '"'],
        ['a % 2', 'value', '"'],
      ],
      comments: [' mootant-ignore-next-line '],
    })
  })

  it('marks event handlers and reads only the list of v-for', () => {
    expect(
      collect([
        '<template>',
        '  <button @click="a++" v-on:input="go(1); a--" @[e]="h">',
        '    <i v-for="(item, i) in items.slice(1)" :key="item.id">{{ i }}</i>',
        '  </button>',
        '</template>',
      ]),
    ).toStrictEqual({
      expressions: [
        ['a++', 'event', '"'],
        ['go(1); a--', 'event', '"'],
        ['h', 'event', '"'],
        ['items.slice(1)', 'value', '"'],
        ['i', 'value', '}}'],
      ],
      comments: [],
    })
  })

  it('leaves out code the compiler reads as a pattern or as written', () => {
    expect(
      collect([
        '<template>',
        '  <Comp v-model="a" v-model:open="b" v-memo="[a]" v-slot="{ c }">',
        '    <template #row="{ d }"><i :key="d" v-bind:key="d" :x="" /></template>',
        '    <i v-for="item in" /><i v-pre :a="b">{{ c }}</i><i :foo />',
        '  </Comp>',
        '</template>',
      ]),
    ).toStrictEqual({ expressions: [], comments: [] })
  })

  it('leaves out unquoted values and decoded character references', () => {
    expect(
      collect([
        '<template>',
        '  <i :a=b+1 :c="d &amp;&amp; e" :f="g &&h" v-for="x in &quot;ab&quot;">',
        '    {{ i &lt; 2 }} {{ j < 2 }}',
        '  </i>',
        '</template>',
      ]),
    ).toStrictEqual({
      expressions: [
        ['g &&h', 'value', '"'],
        ['j < 2', 'value', '}}'],
      ],
      comments: [],
    })
  })

  it('reads only the top-level template of markup', () => {
    expect(collect(['<script>{{ a }}</script>'])).toStrictEqual({
      expressions: [],
      comments: [],
    })
    expect(
      collect(['<template lang="pug">p {{ a }}</template>']).expressions,
    ).toStrictEqual([])
    expect(
      collect(['<template lang="html"><p>{{ a }}</p></template>']).expressions,
    ).toStrictEqual([['a', 'value', '}}']])
  })
})
