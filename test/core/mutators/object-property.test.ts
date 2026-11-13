import { describe, expect, it } from 'vitest'

import type { MutatorSetup } from '../../helpers/generate-candidates'

import { listMutatedSources } from '../../helpers/list-mutated-sources'
import { generateMutants } from '../../helpers/generate-mutants'

describe('objectProperty', () => {
  it.each<{ expected: string[]; source: string }>([
    {
      expected: [
        'x = { ...defaults, nested: { x } }',
        'x = { name, nested: { x } }',
        'x = { name, ...defaults, nested: {} }',
      ],
      source: 'x = { name, ...defaults, nested: { x } }',
    },
    {
      expected: [
        'x = { age: 30, method() { return run() }, get v() { return y } }',
      ],
      source:
        'x = { name, age: 30, method() { return run() }, get v() { return y } }',
    },
    {
      source: 'const f = () => ({ id })',
      expected: ['const f = () => ({})'],
    },
    {
      source: 'x = {}',
      expected: [],
    },
  ])('mutates $source as in the catalog', ({ expected, source }) => {
    expect(listMutatedSources('object-property', source)).toStrictEqual(
      expected,
    )
  })

  it.each<{ expected: string[]; source: string }>([
    {
      expected: [
        ['x = {', '  b,', '}'].join('\n'),
        ['x = {', '  a,', '}'].join('\n'),
      ],
      source: ['x = {', '  a,', '  b,', '}'].join('\n'),
    },
    {
      source: 'let { a, b } = options',
      expected: [],
    },
  ])('handles $source', ({ expected, source }) => {
    expect(listMutatedSources('object-property', source)).toStrictEqual(
      expected,
    )
  })

  it.each<{ setup: MutatorSetup; source: string }>([
    {
      source: [
        '// mootant-ignore-next-line number-literal: fixed age',
        'x = { age: 30 }',
      ].join('\n'),
      setup: {},
    },
    {
      setup: { mutators: { 'number-literal': 'off' } },
      source: 'x = { age: 30 }',
    },
  ])(
    'removes a member whose own mutant will not run in $source',
    ({ source, setup }) => {
      expect(
        listMutatedSources('object-property', source, setup),
      ).toStrictEqual([source.replace('{ age: 30 }', '{}')])
    },
  )

  it.each<{ expected: string[]; source: string }>([
    {
      expected: [
        "new Intl.PluralRules('en-US', {}) (equivalent default-option)",
      ],
      source: "new Intl.PluralRules('en-US', { type: 'cardinal' })",
    },
    {
      expected: [
        "Intl.NumberFormat('en', { minimumIntegerDigits: 1 as const, maximumFractionDigits: 2 }) (equivalent default-option)",
        "Intl.NumberFormat('en', { 'style': 'decimal', maximumFractionDigits: 2 }) (equivalent default-option)",
        "Intl.NumberFormat('en', { 'style': 'decimal', minimumIntegerDigits: 1 as const }) (subsumed solitary)",
      ],
      source:
        "Intl.NumberFormat('en', { 'style': 'decimal', minimumIntegerDigits: 1 as const, maximumFractionDigits: 2 })",
    },
  ])(
    'skips an option of Intl set to its default in $source',
    ({ expected, source }) => {
      expect(
        listMutatedSources('object-property', source, { skipped: true }),
      ).toStrictEqual(expected)
      expect(
        listMutatedSources('object-property', source, {
          preset: 'strict',
          skipped: true,
        }),
      ).toStrictEqual(
        expected.filter(line => line.endsWith('(equivalent default-option)')),
      )
    },
  )

  it('removes a member with its comma, or the whole literal when a spread would change the member', () => {
    let source =
      "x = { a, b: 1, ...c, get d() { return 1 }, __proto__: base, ['__proto__']: 2, e() { return super.e() }, f }"
    let literal = source.slice(4)

    expect(
      generateMutants(source, { file: 'example.js', preset: 'strict' })
        .filter(mutant => mutant.mutator === 'object-property')
        .map(mutant => [
          mutant.kind,
          source.slice(mutant.start, mutant.end),
          mutant.focus ?
            source.slice(mutant.focus.start, mutant.focus.end)
          : null,
        ]),
    ).toStrictEqual([
      ['expression', literal, null],
      ['expression', literal, null],
      ['expression', literal, null],
      ['expression', literal, null],
      ['property', 'a, ', 'a'],
      ['property', 'b: 1, ', 'b: 1'],
      ['property', '...c, ', '...c'],
      ['property', ', f', 'f'],
    ])
  })

  it.each(['recommended', 'strict'])(
    'leaves the props that defineProps declares to the Vue compiler under %s',
    preset => {
      let source = [
        '<script setup>',
        'defineProps({ sku: String, count: Number })',
        '</script>',
      ].join('\n')
      let setup = { file: 'card.vue', preset }

      expect(
        listMutatedSources('object-property', source, setup),
      ).toStrictEqual([])
      expect(
        listMutatedSources('object-property', source, {
          ...setup,
          skipped: true,
        }),
      ).toStrictEqual([
        `${source.replace('sku: String, ', '')} (invalid compiler-macro)`,
        `${source.replace(', count: Number', '')} (invalid compiler-macro)`,
      ])
    },
  )

  it.each<{ expected: string[]; source: string; file?: string }>([
    {
      expected: ["new Intl.PluralRules('en', {}) (subsumed solitary)"],
      source: "new Intl.PluralRules('en', { type: 'ordinal' })",
    },
    {
      expected: [
        "let Intl = globalThis.Intl; new Intl.PluralRules('en', {}) (subsumed solitary)",
      ],
      source:
        "let Intl = globalThis.Intl; new Intl.PluralRules('en', { type: 'cardinal' })",
    },
    {
      expected: [
        "new Intl.PluralRules('en', { type: 'cardinal' }) (subsumed solitary)",
        "new Intl.PluralRules('en', { type: 'ordinal' }) (subsumed solitary)",
      ],
      source:
        "new Intl.PluralRules('en', { type: 'ordinal', type: 'cardinal' })",
      file: 'example.js',
    },
    {
      expected: ["new Intl.PluralRules('en', { ...base }) (subsumed solitary)"],
      source: "new Intl.PluralRules('en', { ...base, type: 'cardinal' })",
    },
    {
      expected: [
        "new Intl.PluralRules('en', { __proto__: base }) (subsumed solitary)",
      ],
      source:
        "new Intl.PluralRules('en', { __proto__: base, type: 'cardinal' })",
    },
    {
      expected: [
        "new Intl.PluralRules('en', { type: 'cardinal' }) (subsumed solitary)",
        "new Intl.PluralRules('en', { [name]: 1 }) (subsumed solitary)",
      ],
      source: "new Intl.PluralRules('en', { [name]: 1, type: 'cardinal' })",
    },
    {
      expected: ['new Intl.PluralRules({}) (subsumed solitary)'],
      source: "new Intl.PluralRules({ type: 'cardinal' })",
    },
    {
      expected: ['new Intl.PluralRules(...locales, {}) (subsumed solitary)'],
      source: "new Intl.PluralRules(...locales, { type: 'cardinal' })",
    },
    {
      expected: ["new Intl.Locale('en', {}) (subsumed solitary)"],
      source: "new Intl.Locale('en', { calendar: 'gregory' })",
    },
    {
      source:
        "new Intl.PluralRules('en', { get type() { return 'cardinal' } })",
      expected: ["new Intl.PluralRules('en', ({})) (subsumed solitary)"],
    },
    {
      source: "let type = 'cardinal'; new Intl.PluralRules('en', { type })",
      expected: [],
    },
    {
      expected: [
        "new Intl.NumberFormat('en', ({ style: 'decimal' })) (subsumed solitary)",
        "new Intl.NumberFormat('en', { get minimumIntegerDigits() { return this.style === 'decimal' ? 2 : 1 } }) (subsumed solitary)",
      ],
      source:
        "new Intl.NumberFormat('en', { style: 'decimal', get minimumIntegerDigits() { return this.style === 'decimal' ? 2 : 1 } })",
    },
  ])(
    'keeps the default-option rule off in $source',
    ({ expected, source, file }) => {
      expect(
        listMutatedSources('object-property', source, {
          skipped: true,
          ...(file && { file }),
        }),
      ).toStrictEqual(expected)
    },
  )
})
