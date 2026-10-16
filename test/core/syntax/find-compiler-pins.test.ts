import { describe, expect, it } from 'vitest'

import { findCompilerPins } from '../../../core/syntax/find-compiler-pins'
import { createTestFile } from '../../helpers/create-test-file'

/**
 * Finds the pins of a snippet and shows them as text.
 *
 * @param source - Text of the program.
 * @param file - Path that tells the framework.
 * @returns Pinned text and region text of every pin.
 */
function pin(source: string, file: string): string[][] {
  let { tree } = createTestFile(source)
  return findCompilerPins(tree, file).map(entry => [
    source.slice(entry.start, entry.end),
    source.slice(entry.region.start, entry.region.end),
  ])
}

/**
 * Finds the reasons of the pins of a snippet.
 *
 * @param source - Text of the program.
 * @param file - Path that tells the framework.
 * @returns Reason of every pin.
 */
function reasons(source: string, file: string): string[] {
  let { tree } = createTestFile(source)
  return findCompilerPins(tree, file).map(entry => entry.reason)
}

describe('findCompilerPins', () => {
  it('pins nothing outside Svelte and Vue files', () => {
    expect(pin('let count = $state(0); defineProps()', 'a.ts')).toStrictEqual(
      [],
    )
  })

  it.each([
    'App.svelte',
    'store.svelte.ts',
    'store.svelte.js',
    'tally.svelte.store.js',
    'store.svelte.test.ts',
  ])('pins a rune call within its initializer in %s', file => {
    expect(pin('let count = ($state(0))', file)).toStrictEqual([
      ['$state(0)', '($state(0))'],
    ])
    expect(reasons('let count = $state(0)', file)).toStrictEqual([
      'it would move a Svelte rune call out of the place the compiler accepts it in',
    ])
  })

  it('pins a rune field of a constructor within the constructor body', () => {
    let source = 'class A { constructor() { this.n = $state(0) } }'

    expect(pin(source, 'App.svelte')).toStrictEqual([
      ['$state(0)', '{ this.n = $state(0) }'],
    ])
  })

  it('pins no call that is not a rune in place', () => {
    expect(pin('use($state(0)); defineProps()', 'App.svelte')).toStrictEqual([])
  })

  it.each(['svelte.ts.bak', 'a.svelte.json', 'a.svelte.d'])(
    'pins nothing in %s',
    file => {
      expect(pin('let count = $state(0)', file)).toStrictEqual([])
    },
  )

  it('pins a $inspect.trace call within the body of its function', () => {
    let source = 'let a = $derived.by(() => { $inspect.trace(); return 1 })'

    expect(pin(source, 'App.svelte')).toStrictEqual([
      [
        '$derived.by(() => { $inspect.trace(); return 1 })',
        '$derived.by(() => { $inspect.trace(); return 1 })',
      ],
      ['$inspect.trace()', '{ $inspect.trace(); return 1 }'],
    ])
    expect(
      reasons("function f() { $inspect.trace('f') }", 'a.svelte.js'),
    ).toStrictEqual([
      'it would move a Svelte $inspect.trace call from the start of its function body, where the compiler accepts it',
    ])
    expect(pin('$inspect.trace(); $inspect(a)', 'App.svelte')).toStrictEqual([])
    expect(pin('function f() { $inspect.trace() }', 'a.ts')).toStrictEqual([])
  })

  it('pins a Vue compiler macro within its top-level statement', () => {
    let source = 'let props = withDefaults(defineProps(), { a: 1 })'

    expect(pin(source, 'Card.vue')).toStrictEqual([
      [
        'withDefaults(defineProps(), { a: 1 })',
        'let props = withDefaults(defineProps(), { a: 1 })',
      ],
      ['defineProps()', 'let props = withDefaults(defineProps(), { a: 1 })'],
    ])
    expect(pin('if (a) { defineExpose() }', 'Card.vue')).toStrictEqual([
      ['defineExpose()', 'if (a) { defineExpose() }'],
    ])
    expect(reasons('defineSlots()', 'Card.vue')).toStrictEqual([
      'it would move a Vue compiler macro out of the top level of the script, where the compiler reads it',
    ])
  })

  it('pins the model name of defineModel', () => {
    expect(
      pin("defineModel(('open'), { default: 1 })", 'Card.vue'),
    ).toStrictEqual([
      [
        "defineModel(('open'), { default: 1 })",
        "defineModel(('open'), { default: 1 })",
      ],
      ["'open'", "('open')"],
    ])
    expect(reasons("defineModel('open')", 'Card.vue')[1]).toBe(
      'the Vue compiler reads the model name of defineModel as written, so the mutant switch would rename the model',
    )
    expect(pin('defineModel(`open`)', 'Card.vue')).toStrictEqual([
      ['defineModel(`open`)', 'defineModel(`open`)'],
      ['`open`', '`open`'],
    ])
    expect(pin(`defineModel(\`a\${b}\`)`, 'Card.vue')).toHaveLength(1)
    expect(pin('defineModel({ default: 1 })', 'Card.vue')).toHaveLength(1)
    expect(pin('defineModel(1)', 'Card.vue')).toHaveLength(1)
  })

  it('pins the props that defineProps declares', () => {
    expect(pin("defineProps(['a', ...b])", 'Card.vue')).toStrictEqual([
      ["defineProps(['a', ...b])", "defineProps(['a', ...b])"],
      ["['a', ...b]", "['a', ...b]"],
      ["'a'", "'a'"],
      ['...b', '...b'],
    ])
    expect(pin("defineProps(['a', , 'b'])", 'Card.vue')).toHaveLength(4)
    expect(pin('defineProps({ a: Number })', 'Card.vue')).toStrictEqual([
      ['defineProps({ a: Number })', 'defineProps({ a: Number })'],
      ['{ a: Number }', '{ a: Number }'],
    ])
    expect(reasons('defineProps([])', 'Card.vue')[1]).toBe(
      'the Vue compiler reads the props that defineProps declares as written, so the mutant switch would hide them from it',
    )
  })

  it('pins nothing else in the arguments of a macro', () => {
    expect(pin('defineProps(...a); defineEmits()', 'Card.vue')).toStrictEqual([
      ['defineProps(...a)', 'defineProps(...a);'],
      ['defineEmits()', 'defineEmits()'],
    ])
    expect(pin('defineProps(props)', 'Card.vue')).toHaveLength(1)
    expect(pin("defineEmits(['a'])", 'Card.vue')).toHaveLength(1)
  })
})
