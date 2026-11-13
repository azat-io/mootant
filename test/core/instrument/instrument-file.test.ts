import type { TemplateChildNode, RootNode } from '@vue/compiler-dom'

import { compile as compileDom, parse as parseDom } from '@vue/compiler-dom'
import { compileTemplate, compileScript, parse } from 'vue/compiler-sfc'
import { compileModule, compile } from 'svelte/compiler'
import { createContext, runInContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'

import { installMutantRuntime } from '../../../core/runtime/install-mutant-runtime'
import { getSyntaxFingerprint } from '../../helpers/get-syntax-fingerprint'
import { instrumentFile } from '../../../core/instrument/instrument-file'
import { runSwitchedProgram } from '../../helpers/run-switched-program'
import { compareCodeUnits } from '../../../core/compare-code-units'
import expectations from '../../fixtures/list/expectations.json'
import { generateMutants } from '../../helpers/generate-mutants'
import { createReader } from '../../helpers/create-reader'
import { createMutant } from '../../helpers/create-mutant'
import { applyMutant } from '../../helpers/apply-mutant'
import { runProgram } from '../../helpers/run-program'

/**
 * Programs whose mutants share ranges, nest, start statements and remove
 * statements, with the inputs of `f`.
 */
const PROGRAMS: { inputs: unknown[][]; lines: string[]; file: string }[] = [
  {
    lines: [
      String.raw`let word = /\b[a-z]{2}/gi`,
      'function f(text) {',
      '  let found = []',
      '  let match',
      '  while ((match = word.exec(text))) found.push(match[0])',
      String.raw`  return [found, text.replace(/^\s+|\s+$/g, ''), /^(?:a|b)c?$/m.test(text)]`,
      '}',
    ],
    inputs: [[''], ['ab'], [' Hi there '], ['bc\nx'], ['a1 b2']],
    file: 'example.js',
  },
  {
    lines: [
      String.raw`let digits = new RegExp('\\d+', 'g')`,
      'function f(text, word) {',
      String.raw`  let spaced = text.replace(RegExp(String.raw${'`'}\s+$${'`'}), '')`,
      `  return [spaced.match(digits), new RegExp(\`^\${word}\\\\b\`, "i").test(text)]`,
      '}',
    ],
    inputs: [
      ['', 'a'],
      ['ab 12 ', 'ab'],
      ['A1 b2', 'a'],
      ['x 3', 'ab'],
    ],
    file: 'example.js',
  },
  {
    lines: [
      'let total = 0',
      'function f(value, min, max) {',
      '  let result = value',
      '  if (value < min) result = min',
      '  else if (value > max) result = max',
      '  total += result',
      '  ;[min, max].forEach(x => run(x))',
      '  return result * 2 + total',
      '}',
    ],
    inputs: [
      [0, 1, 3],
      [2, 1, 3],
      [5, 1, 3],
      [3, 3, 3],
    ],
    file: 'example.js',
  },
  {
    lines: [
      'function f(text: string, items: { id: string; n: number }[]) {',
      '  if (text.trim().length === 0) return null',
      '  let parts = items.filter(item => item.n > 1).map(item => item.id)',
      '  emit(parts.length, text.toUpperCase())',
      "  return parts.join(',') || items.at(0)?.id || 'none'",
      '}',
    ],
    inputs: [
      ['', []],
      [' a ', []],
      ['b', [{ id: 'x', n: 1 }]],
      [
        'c',
        [
          { id: 'x', n: 2 },
          { id: 'y', n: 1 },
          { id: 'z', n: 3 },
        ],
      ],
    ],
    file: 'example.ts',
  },
  {
    lines: [
      'async function f(label, values) {',
      '  let count = 0',
      '  for (const value of values) count += value',
      '  await settle(label, count)',
      '  save(count)',
      "  return count > 1 && label !== ''",
      '}',
    ],
    inputs: [
      ['', []],
      ['a', [1]],
      ['b', [1, 2]],
    ],
    file: 'example.js',
  },
  {
    lines: [
      "let base = { label() { return 'base' } }",
      'function f(name, extra) {',
      '  let item = {',
      '    __proto__: base,',
      '    name,',
      '    id: 1,',
      '    ...extra,',
      '    id: 2,',
      "    [name + 'Key']: run(name),",
      "    2: 'two',",
      "    1: 'one',",
      "    label() { return 'own ' + super.label() },",
      '    wrap() { return () => super.label() },',
      "    peek() { return eval('super.label()') },",
      '    size() { return this.name.length },',
      "    get length() { use('length'); return name.length },",
      '    set length(value) { save(value) },',
      '    handler: function () {},',
      '    Widget: class {},',
      '  }',
      '  item.length = 3',
      '  return [',
      '    Object.keys(item),',
      '    Object.getPrototypeOf(item) === base,',
      '    item.label(),',
      '    item.wrap()(),',
      '    item.peek(),',
      '    item.size(),',
      '    item.length,',
      '    item.handler.name,',
      '    item.Widget.name,',
      '    item.id,',
      '  ]',
      '}',
    ],
    inputs: [
      ['a', {}],
      ['bb', { label: 'shadow', name: 'x', id: 3 }],
      ['', null],
      ['c', createReader({ other: 5, id: 4 })],
    ],
    file: 'example.js',
  },
  {
    lines: [
      "let base = { kind: 'base' }",
      'function f(value) {',
      "  let first = { '__proto__': base, kind: value }",
      "  let second = { ['__proto__']: value, b: 1, 2: 'two', 1: 'one', a: 0 }",
      '  return [',
      '    Object.getPrototypeOf(first) === base,',
      '    first.kind,',
      '    Object.keys(second),',
      '    Object.getPrototypeOf(second) === Object.prototype,',
      "    Object.hasOwn(second, '__proto__') && second.__proto__ === value,",
      '  ]',
      '}',
    ],
    inputs: [['x'], [null], [{ a: 1 }]],
    file: 'example.js',
  },
  {
    lines: [
      'function* pair() {',
      "  use('first')",
      '  yield 1',
      "  use('second')",
      '  yield 2',
      '}',
      'function f(items, extra) {',
      '  let list = [extra, ...items, ...pair(), [...items]]',
      '  let lengths = [[...items].length, [extra, extra].length, list.length]',
      '  return [',
      '    list,',
      '    lengths,',
      '    Array.from({ length: items.length }, (_, index) => index * 2),',
      '  ]',
      '}',
    ],
    inputs: [
      [[], 0],
      [[1, 2], 'x'],
      [['a'], null],
    ],
    file: 'example.js',
  },
  {
    lines: [
      'function f(a: number, b: number) {',
      '  let pair = [a, b] as const',
      '  let summary = { a, total: a + b } satisfies { a: number; total: number }',
      '  return [pair, summary, Object.keys(summary), pair.length]',
      '}',
    ],
    inputs: [
      [1, 2],
      [0, 0],
      [-1, 5],
    ],
    file: 'example.ts',
  },
  {
    lines: [
      'let base = { x: 1 }',
      'function f(extra: unknown) {',
      '  let item = {',
      '    __proto__: base,',
      '    extra,',
      "    direct() { return eval!('super.x') },",
      "    cast() { return (eval as (code: string) => unknown)('super.x') },",
      '  }',
      '  return [item.direct(), item.cast(), Object.keys(item)]',
      '}',
    ],
    inputs: [[0], ['a']],
    file: 'example.ts',
  },
]

/**
 * Calls of Vue compiler macros that the compiler left in place.
 */
const MACRO_CALL_PATTERN =
  /\b(?:define(?:Emits|Expose|Model|Options|Props|Slots)|withDefaults)\(/u

/**
 * Vue components whose scripts use every compiler macro.
 */
const VUE_COMPONENTS: string[][] = [
  [
    '<script setup lang="ts">',
    "defineOptions({ name: 'Box', inheritAttrs: false })",
    'let props = withDefaults(defineProps<{ size?: number }>(), { size: 2 })',
    "let emit = defineEmits(['change', 'close'])",
    "let open = defineModel('open', { default: false })",
    'let tab = defineModel(`tab`, { default: 1 })',
    "let text = defineModel<string>({ default: 'x' })",
    'defineExpose({ twice: () => props.size * 2 })',
    'defineSlots<{ default?: () => unknown }>()',
    "emit('change', open.value ? 1 : 0)",
    '</script>',
    '',
    '<template><i>{{ props.size }}{{ text }}</i></template>',
  ],
  [
    '<script>',
    'export let limit = 3',
    '</script>',
    '',
    '<script setup>',
    "let { size = 2, tag = 'div' } = defineProps(['size', 'tag'])",
    'let emit = defineEmits({ change: value => value > limit })',
    'function grow() {',
    '  emit(size > 1 ? "change" : "close", size + 1)',
    '}',
    '</script>',
    '',
    '<template><component :is="tag" @click="grow" /></template>',
  ],
]

/**
 * Vue component whose template uses every kind of expression mootant reads.
 */
const VUE_TEMPLATE = [
  '<script setup lang="ts">',
  "import { computed, ref } from 'vue'",
  'let props = defineProps<{ items: { id: number; on: boolean; name: string }[]; label?: string }>()',
  'let count = ref(0)',
  'let open = ref(false)',
  "let text = ref('')",
  'function go(step: number) { count.value += step }',
  'function onSave() {}',
  'let total = computed(() => props.items.length * 2)',
  '</script>',
  '',
  '<template>',
  '  <div v-if="props.items.length > 0 && open" :class="{ on: count > 1, [props.label ?? \'x\']: open }" :style=\'{ width: count + "px" }\'>',
  '    <p v-for="(item, i) in props.items.filter(item => item.on)" :key="item.id + i" :data-i="i * 2">',
  "      {{ item.name.trim() || 'none' }}",
  '    </p>',
  '    <p v-if="count > 2">{{ total >= 3 ? \'many\' : "few" }}</p>',
  '    <p v-else-if="!open">{{ count - 1 }}</p>',
  '    <input v-model="text" :disabled="count >= 3 || !open" v-show="text.length < 10" />',
  '    <button @click="count++" @dblclick="go(2); count--" @input="onSave" @blur="() => go(count + 1)"',
  '      @focus="function () { go(-1) }" @keyup.enter="go((count as number) + 1)">',
  `      {{ \`\${count} / \${total}\` }}`,
  '    </button>',
  '    <component :is="open ? \'b\' : \'i\'" v-bind="{ title: text + \'!\' }" v-on="{ mouseenter: () => go(1) }" />',
  '    <slot name="row" :value="count * 2" />',
  '    <template v-for="n in 3" :key="n"><i v-if="n % 2 === 0">{{ n }}</i></template>',
  '    <i>{{ JSON.stringify({ n: count, at: { on: open } }) }}</i>',
  '    <span v-html="\'<b>\' + text + \'</b>\'"></span><span v-text="text.slice(1)"></span>',
  '    <!-- mootant-ignore-next-line -->',
  '    <i :title="count - 1"></i>',
  '  </div>',
  '  <p v-else>{{ props.label ?? "empty" }}</p>',
  '</template>',
]

/**
 * Vue component whose event handlers Vue compiles by whether their text has a
 * `;`: functions with statements after a line break, and a single inline
 * expression whose result Vue reads.
 */
const VUE_HANDLERS = [
  '<script setup>',
  "import { ref } from 'vue'",
  'let n = ref(0)',
  'let ready = ref(true)',
  'function go(step) { n.value += step }',
  'async function save() {}',
  '</script>',
  '',
  '<template>',
  '  <button @click.stop="function () { n -= 1 }" @dblclick="async function () { go(1)',
  '    n > 1 ? go(2) : go(3) }" @focus="ready && save()" @blur="() => { go(1)',
  '    n > 1 ? go(2) : go(3) }" @keyup="go(1); n > 1 ? go(2) : go(3)">{{ n }}</button>',
  '</template>',
]

/**
 * Svelte components and modules whose scripts use runes in every position the
 * compiler accepts.
 */
const SVELTE_FILES: { lines: string[]; file: string }[] = [
  {
    lines: [
      '<script>',
      "  let { size = 2, label = 'box', bound = $bindable(1) } = $props()",
      '  let count = $state(size * 2)',
      '  let items = $state.raw([1, 2])',
      '  let double = $derived(count > 3 ? count * 2 : count)',
      '  let total = $derived.by(() => items.reduce((a, b) => a + b, 0))',
      '  let half = $derived.by(() => {',
      "    $inspect.trace('half')",
      '    return count > 2 ? count / 2 : 0',
      '  })',
      '  let id = $props.id()',
      '  $effect(() => {',
      '    if (count > 1) bound = count - 1',
      '  })',
      '</script>',
      '',
      '<i id={id}>{label}{double}{total}{half}{bound}</i>',
    ],
    file: 'box.svelte',
  },
  {
    lines: [
      'export class Tally {',
      '  step = $state(1)',
      '  twice = $derived(this.step * 2)',
      '  constructor(start) {',
      '    this.count = $state(start + 1)',
      '    this.log = []',
      '  }',
      '  add() {',
      '    this.count += this.step',
      "    this.log.push('add')",
      '  }',
      '}',
    ],
    file: 'tally.svelte.js',
  },
  {
    lines: [
      'export class Tally {',
      '  constructor(start) {',
      '    this.count = $state(start)',
      '  }',
      '  twice() {',
      '    $inspect.trace()',
      '    return this.count * 2',
      '  }',
      '}',
    ],
    file: 'tally.svelte.store.js',
  },
  {
    lines: [
      '<script lang="ts">',
      "  let { items = [], a = 0, b = '', tag = 'b', rest = {} }: any = $props()",
      '  let count = $state(0)',
      '  let value = $state(a + 1)',
      '</script>',
      '',
      "<div {...(a > 1 ? rest : {})} hidden={!a} aria-label={'n' + (a + 1)}></div>",
      '<p title="x {a + 1} {b ? "y" : \'z\'}" class:on={a > 1} class:a {b}>',
      '  {(a as number) * 2}',
      '</p>',
      '<input bind:value style:width="{a + 1}px" />',
      "{#each items.filter((item: any) => item.on) as { id, name = 'n' }, i (id + 1)}",
      '  <span data-i={i * 2}>{name}</span>',
      '{:else}',
      '  {#if a > 2}{@const twice = a * 2}{twice}{:else if !b}none{/if}',
      '{/each}',
      '{#each { length: a + 1 }, i}{i}{/each}',
      '{#snippet row(step = a + 1)}{step - 1}{/snippet}',
      '{@render row(a - 1)}',
      '{let half = a / 2}{half}',
      '<button onclick={() => count++} disabled={count >= 3 || !a}>{count}</button>',
      "<svelte:element this={a ? tag : 'i'}>t</svelte:element>",
      '<svelte:element this="em">t</svelte:element>',
      "{#await Promise.resolve(a + 1) then got}{got > 1 ? 'big' : 'small'}{/await}",
      '{#key a % 2}k{/key}',
      "{@html '<b>' + b.trim() + '</b>'}",
      '<div {@attach (node: any) => node.focus()}></div>',
    ],
    file: 'card.svelte',
  },
]

describe('instrumentFile', () => {
  it('returns the text as is without mutants', () => {
    expect(
      instrumentFile({ file: 'example.ts', source: 'let =', mutants: [] }),
    ).toBe('let =')
  })

  it('hosts every range and keeps the text between them', () => {
    let source = ['let a = 1', 'a++', 'run(a)'].join('\n')

    expect(
      instrumentFile({
        mutants: [
          createMutant({ replacement: 'a--', start: 10, end: 13 }),
          createMutant({ replacement: '0', start: 8, id: 'm2', end: 9 }),
        ],
        file: 'example.ts',
        source,
      }),
    ).toBe(
      [
        'let a = (globalThis.__mootant?.hit("m2") ? (0) : (1))',
        ';(globalThis.__mootant?.hit("m1") ? (a--) : (a++))',
        'run(a)',
      ].join('\n'),
    )
  })

  it('hosts the removals of one literal around it with a copy of it', () => {
    let source = ['x = [a, ...b]', 'y = { c, d }'].join('\n')
    let removal = { replacement: '', text: '' }
    let runtime = 'globalThis.__mootant'

    expect(
      instrumentFile({
        mutants: [
          createMutant({
            focus: { ...removal, start: 5, end: 6 },
            list: { start: 4, end: 13 },
            ...removal,
            kind: 'element',
            start: 5,
            id: 'm1',
            end: 8,
          }),
          createMutant({
            focus: { ...removal, start: 8, end: 12 },
            list: { start: 4, end: 13 },
            ...removal,
            kind: 'element',
            start: 6,
            id: 'm2',
            end: 12,
          }),
          createMutant({
            focus: { ...removal, start: 20, end: 21 },
            list: { start: 18, end: 26 },
            ...removal,
            kind: 'property',
            start: 20,
            id: 'm3',
            end: 23,
          }),
          createMutant({
            focus: { ...removal, start: 23, end: 24 },
            list: { start: 18, end: 26 },
            ...removal,
            kind: 'property',
            start: 21,
            id: 'm4',
            end: 24,
          }),
        ],
        file: 'example.js',
        source,
      }),
    ).toBe(
      [
        `x = (${runtime}?.hitAny(["m1", "m2"]) ? ${runtime}.cut([(${runtime}.active === "m1" ? ${runtime}.gap : a), ...(${runtime}.active === "m2" ? ${runtime}.none : b)]) : [a, ...b])`,
        `y = (${runtime}?.hitAny(["m3", "m4"]) ? { ...(${runtime}.active === "m3" ? {} : { c }), ...(${runtime}.active === "m4" ? {} : { d }) } : { c, d })`,
      ].join('\n'),
    )
  })

  it('keeps the switched text of a table within a linear bound under strict', () => {
    let entries = Array.from(
      { length: 400 },
      (_, index) => `  'entity${index};': ${index + 100},`,
    )
    let source = ['export default {', ...entries, '}'].join('\n')
    let file = 'entities.js'
    let mutants = generateMutants(source, { preset: 'strict', file })
    let switched = instrumentFile({ mutants, source, file })

    expect(
      mutants.filter(mutant => mutant.mutator === 'object-property'),
    ).toHaveLength(400)
    expect(switched.length).toBeLessThan(50 * source.length)
  })

  it('copies a nested literal once more for each literal with removals around it', () => {
    let depth = 6
    let source = 'export let list = deep'
    for (let level = depth; level > 0; level--) {
      source = source.replace('deep', `[item${level}, deep]`)
    }
    let file = 'nested.js'
    let mutants = generateMutants(source, { preset: 'strict', file })
    let switched = instrumentFile({ mutants, source, file })

    expect(
      mutants.filter(mutant => mutant.mutator === 'array-element'),
    ).toHaveLength(2 * depth)
    expect(switched.split('deep')).toHaveLength(depth + 2)
  })

  it('reaches the runtime through Math in a Vue template', () => {
    let source = [
      '<script setup>let a = 1 + 2</script>',
      '<template><p :title="a > 1">{{ a - 1 }}</p></template>',
    ].join('\n')

    expect(
      instrumentFile({
        mutants: [
          createMutant({ replacement: 'a >= 1', start: 58, end: 63 }),
          createMutant({ replacement: '1 - 2', start: 22, id: 'm2', end: 27 }),
        ],
        file: 'card.vue',
        source,
      }),
    ).toBe(
      [
        '<script setup>let a = (globalThis.__mootant?.hit("m2") ? (1 - 2) : (1 + 2))</script>',
        '<template><p :title="(Math[Symbol.for(`mootant`)]?.hit(`m1`) ? (a >= 1) : (a > 1))">{{ a - 1 }}</p></template>',
      ].join('\n'),
    )
    expect(
      instrumentFile({
        mutants: [createMutant({ replacement: '0', start: 13, end: 14 })],
        source: '<template>{{ 1 }}</template>',
        file: 'card.vue',
      }),
    ).toBe(
      '<template>{{ (Math[Symbol.for(`mootant`)]?.hit(`m1`) ? (0) : (1)) }}</template>',
    )
  })

  it('runs the array iterator only where the code it switches does', () => {
    let source = 'list = [a, ...rest, [b]]'
    let file = 'example.js'
    let mutants = generateMutants(source, { preset: 'strict', file }).filter(
      mutant => mutant.kind === 'element',
    )
    let switched = instrumentFile({ mutants, source, file })

    expect(mutants).toHaveLength(4)
    expect(runCountingIterator(switched, null)).toStrictEqual(
      runCountingIterator(source, null),
    )
    for (let mutant of mutants) {
      expect(runCountingIterator(switched, mutant.id)).toStrictEqual(
        runCountingIterator(applyMutant(source, mutant), null),
      )
    }
  })

  it('throws when the text does not parse', () => {
    expect(() =>
      instrumentFile({
        mutants: [createMutant({ start: 0, end: 1 })],
        file: 'example.ts',
        source: 'let =',
      }),
    ).toThrow('The original text of example.ts does not parse.')
  })

  it.each(
    expectations.files.flatMap(({ file }) =>
      ['recommended', 'strict'].map(preset => ({ preset, file })),
    ),
  )(
    'hosts every pending mutant of $file under $preset in a text that parses',
    async ({ preset, file }) => {
      let source = await readFile(file, 'utf8')
      let mutants = generateMutants(source, { preset, file })
      let pending = mutants.filter(mutant => mutant.status === 'Pending')
      let switched = instrumentFile({ mutants: pending, source, file })
      let sites = [
        ...switched.matchAll(/\?\.hit(?:Any)?\((?<ids>\[[^\]]*\]|[^)]*)\)/gu),
      ].flatMap(site => [...site.groups!['ids']!.matchAll(/\w+/gu)])

      expect(pending.length).toBeGreaterThan(0)
      expect(getSyntaxFingerprint(file, switched)).not.toBeNull()
      expect(
        sites.map(site => site[0]).toSorted(compareCodeUnits),
      ).toStrictEqual(
        pending.map(mutant => mutant.id).toSorted(compareCodeUnits),
      )
    },
  )

  it.each(
    PROGRAMS.flatMap(program =>
      ['recommended', 'strict'].map(preset => ({ ...program, preset })),
    ),
  )(
    'switches $lines.1 under $preset like each mutant applied alone',
    async ({ preset, inputs, lines, file }) => {
      let source = lines.join('\n')
      let mutants = generateMutants(source, { preset, file })
      let switched = instrumentFile({ mutants, source, file })
      let original = await runProgram(source, file, inputs)
      let expected = await Promise.all(
        mutants.map(mutant =>
          runProgram(applyMutant(source, mutant), file, inputs),
        ),
      )
      let actual = await Promise.all(
        mutants.map(mutant =>
          runSwitchedProgram({ active: mutant.id, switched, file }, inputs),
        ),
      )

      expect(mutants.length).toBeGreaterThan(0)
      await expect(
        runSwitchedProgram({ active: undefined, switched, file }, inputs),
      ).resolves.toStrictEqual(original)
      await expect(
        runSwitchedProgram({ active: null, switched, file }, inputs),
      ).resolves.toStrictEqual(original)
      expect(actual).toStrictEqual(expected)
    },
  )

  it.each(
    VUE_COMPONENTS.flatMap(lines =>
      ['recommended', 'strict'].map(preset => ({ preset, lines })),
    ),
  )(
    'switches a Vue component under $preset into one the compiler reads as the original',
    ({ preset, lines }) => {
      let source = lines.join('\n')
      let file = 'box.vue'
      let mutants = generateMutants(source, { preset, file })
      let switched = instrumentFile({ mutants, source, file })
      let original = compileVue(source)
      let result = compileVue(switched)

      expect(mutants.length).toBeGreaterThan(0)
      expect(result.bindings).toStrictEqual(original.bindings)
      expect(result.content).not.toMatch(MACRO_CALL_PATTERN)
    },
  )

  it.each(['recommended', 'strict'])(
    'switches a Vue template under %s into one the Vue compiler accepts as the original',
    preset => {
      let source = VUE_TEMPLATE.join('\n')
      let file = 'card.vue'
      let mutants = generateMutants(source, { preset, file }).filter(
        mutant => mutant.status === 'Pending',
      )
      let pending = mutants.filter(mutant => mutant.scope === '<template>')
      let switched = instrumentFile({
        compilers: {
          vue: { compile: compileDom, parse: parseDom },
          svelte: null,
        },
        mutants,
        source,
        file,
      })

      expect(pending.length).toBeGreaterThan(40)
      expect(describeTemplate(switched)).toStrictEqual(describeTemplate(source))
      expect(
        [
          ...switched.matchAll(/hit(?:Any)?\((?<ids>\[[^\]]*\]|`\w+`)\)/gu),
        ].flatMap(site => site.groups!['ids']!.match(/`\w+`/gu)!),
      ).toHaveLength(pending.length)
      for (let ssr of [false, true]) {
        let { descriptor } = parse(switched, { filename: file })
        let { errors } = compileTemplate({
          compilerOptions: { prefixIdentifiers: true },
          source: descriptor.template!.content,
          filename: file,
          id: 'card',
          ssr,
        })

        expect(errors).toStrictEqual([])
      }
      expect(() =>
        compileScript(parse(switched, { filename: file }).descriptor, {
          inlineTemplate: true,
          id: 'card',
        }),
      ).not.toThrow()
    },
  )

  it.each(['recommended', 'strict'])(
    'keeps how Vue compiles the event handlers of a template under %s',
    preset => {
      let source = VUE_HANDLERS.join('\n')
      let file = 'handlers.vue'
      let mutants = generateMutants(source, { preset, file }).filter(
        mutant => mutant.scope === '<template>',
      )
      let switched = instrumentFile({
        compilers: {
          vue: { compile: compileDom, parse: parseDom },
          svelte: null,
        },
        mutants,
        source,
        file,
      })
      let { descriptor } = parse(switched, { filename: file })
      let { errors, code } = compileTemplate({
        compilerOptions: { prefixIdentifiers: true },
        source: descriptor.template!.content,
        filename: file,
        id: 'handlers',
      })
      let handlers = readEventValues(switched)

      expect(errors).toStrictEqual([])
      expect(code).not.toContain('_ctx.Symbol')
      expect(handlers.map(value => value.includes(';'))).toStrictEqual(
        readEventValues(source).map(value => value.includes(';')),
      )
      expect(handlers.join('\n')).toContain('{}(')
      expect(handlers[2]).toMatch(/^\(Math\[/u)
      expect(code).toContain('$event => (')
    },
  )

  it.each(['recommended', 'strict'])(
    'keeps the classes Svelte scopes in a switched component under %s',
    preset => {
      let source = [
        '<script>',
        '  let { open } = $props()',
        '</script>',
        '',
        '<div class={{ hidden: !open, wide: open }}>x</div>',
        "<span class={['plain', 'wide']}>s</span>",
        '<p class="note">n</p>',
        '',
        '<style>',
        '  .note { color: blue }',
        '</style>',
      ].join('\n')
      let file = 'panel.svelte'
      let mutants = generateMutants(source, { preset, file })
      let switched = instrumentFile({ mutants, source, file })
      let [original, hosted] = [source, switched].map(
        text =>
          compile(text, { filename: file }).js.code.split('svelte-').length,
      )

      expect(
        mutants.filter(mutant => mutant.mutator === 'object-property'),
      ).not.toHaveLength(0)
      expect(hosted).toBe(original)
    },
  )

  it.each(
    SVELTE_FILES.flatMap(entry =>
      ['recommended', 'strict'].map(preset => ({ ...entry, preset })),
    ),
  )(
    'switches $file under $preset into one the Svelte compiler accepts',
    ({ preset, lines, file }) => {
      let source = lines.join('\n')
      let mutants = generateMutants(source, { preset, file })
      let switched = instrumentFile({ mutants, source, file })

      expect(mutants.length).toBeGreaterThan(0)
      for (let generate of ['client', 'server'] as const) {
        expect(() => {
          if (file.endsWith('.svelte')) {
            compile(switched, { filename: file, generate })
          } else {
            compileModule(switched, { filename: file, generate })
          }
        }).not.toThrow()
      }
    },
  )
})

/**
 * Runs a script in a realm of its own whose array iterator counts its calls,
 * with `a`, `b` and `rest` defined and a mutant runtime with the given mutant
 * active.
 *
 * @param code - Script whose last statement gives the result.
 * @param active - Id of the active mutant, or null for the original code.
 * @returns The result as JSON and the number of calls of the array iterator.
 */
function runCountingIterator(
  code: string,
  active: string | null,
): { result: string; calls: number } {
  let runtime = installMutantRuntime()
  Reflect.deleteProperty(globalThis, '__mootant')
  Reflect.deleteProperty(Math, Symbol.for('mootant'))
  runtime.active = active
  let calls = 0
  let context = createContext({
    count() {
      calls += 1
    },
    __mootant: runtime,
  })
  runInContext(
    [
      'let iterator = Array.prototype[Symbol.iterator]',
      'Array.prototype[Symbol.iterator] = function () { count(); return iterator.call(this) }',
      'let a = 1, b = 2, rest = [3, 4]',
    ].join('\n'),
    context,
  )
  let result = JSON.stringify(runInContext(code, context))
  return { result, calls }
}

/**
 * Describes the markup of a Vue component: the elements with the raw names of
 * their attributes and directives, and the interpolations, so a switched
 * template can be compared with the original.
 *
 * @param source - Text of the component.
 * @returns One line per element or interpolation, in tree order.
 */
function describeTemplate(source: string): string[] {
  let lines: string[] = []

  /**
   * Describes a node and the nodes inside it.
   *
   * @param node - Node of the Vue tree.
   */
  function visit(node: TemplateChildNode | RootNode): void {
    if ('tag' in node) {
      let names = node.props.map(property =>
        'rawName' in property ? property.rawName! : property.name,
      )
      lines.push(`${node.tag} ${names.join(' ')}`)
    } else if (node.type === 5) {
      lines.push('{{}}')
    }
    let children = 'children' in node ? node.children : []
    for (let child of children) {
      visit(child as TemplateChildNode)
    }
  }

  visit(parseDom(source, { parseMode: 'sfc' }))
  return lines
}

/**
 * Reads the values of the event handler attributes of a Vue component.
 *
 * @param source - Text of the component.
 * @returns Value of each `@event` attribute, in source order.
 */
function readEventValues(source: string): string[] {
  let values: string[] = []

  /**
   * Reads the event handlers of a node and the nodes inside it.
   *
   * @param node - Node of the Vue tree.
   */
  function visit(node: TemplateChildNode | RootNode): void {
    if ('tag' in node) {
      for (let property of node.props) {
        if ('rawName' in property && property.rawName!.startsWith('@')) {
          values.push(property.exp!.loc.source)
        }
      }
    }
    let children = 'children' in node ? node.children : []
    for (let child of children) {
      visit(child as TemplateChildNode)
    }
  }

  visit(parseDom(source, { parseMode: 'sfc' }))
  return values
}

/**
 * Compiles the script of a Vue component as the Vue plugin does in a test run.
 *
 * @param source - Text of the component.
 * @returns Compiled script and the bindings the compiler found.
 */
function compileVue(source: string): ReturnType<typeof compileScript> {
  let { descriptor } = parse(source, { filename: 'box.vue' })
  return compileScript(descriptor, { inlineTemplate: false, id: 'box' })
}
