import { describe, expect, it } from 'vitest'

import type { MutatorSetup } from '../../helpers/generate-candidates'

import { formatMutant } from '../../helpers/format-mutant'
import { listSkipped } from '../../helpers/list-skipped'
import { runMutator } from '../../helpers/run-mutator'

describe('objectProperty', () => {
  it.each<{ expected: string[]; source: string }>([
    {
      expected: [
        '{ name, ...defaults, nested: { x } } -> { ...defaults, nested: { x } }',
        '{ name, ...defaults, nested: { x } } -> { name, nested: { x } }',
        '{ x } -> {}',
      ],
      source: 'x = { name, ...defaults, nested: { x } }',
    },
    {
      expected: [
        '{ name, age: 30, method() { return run() }, get v() { return y } } -> { age: 30, method() { return run() }, get v() { return y } }',
      ],
      source:
        'x = { name, age: 30, method() { return run() }, get v() { return y } }',
    },
    {
      source: 'const f = () => ({ id })',
      expected: ['{ id } -> {}'],
    },
    {
      source: 'x = {}',
      expected: [],
    },
  ])('mutates $source as in the catalog', ({ expected, source }) => {
    expect(
      runMutator('object-property', source).map(formatMutant),
    ).toStrictEqual(expected)
  })

  it.each<{ expected: string[]; source: string }>([
    {
      expected: [
        '{\n  a,\n  b,\n} -> {\n  b,\n}',
        '{\n  a,\n  b,\n} -> {\n  a,\n}',
      ],
      source: ['x = {', '  a,', '  b,', '}'].join('\n'),
    },
    {
      source: 'let { a, b } = options',
      expected: [],
    },
  ])('handles $source', ({ expected, source }) => {
    expect(
      runMutator('object-property', source).map(formatMutant),
    ).toStrictEqual(expected)
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
        runMutator('object-property', source, setup).map(formatMutant),
      ).toStrictEqual(['{ age: 30 } -> {}'])
    },
  )

  it.each<{ expected: string[]; source: string }>([
    {
      expected: ["{ type: 'cardinal' } -> {} (equivalent default-option)"],
      source: "new Intl.PluralRules('en-US', { type: 'cardinal' })",
    },
    {
      expected: [
        "{ 'style': 'decimal', minimumIntegerDigits: 1 as const, maximumFractionDigits: 2 } -> { minimumIntegerDigits: 1 as const, maximumFractionDigits: 2 } (equivalent default-option)",
        "{ 'style': 'decimal', minimumIntegerDigits: 1 as const, maximumFractionDigits: 2 } -> { 'style': 'decimal', maximumFractionDigits: 2 } (equivalent default-option)",
        "{ 'style': 'decimal', minimumIntegerDigits: 1 as const, maximumFractionDigits: 2 } -> { 'style': 'decimal', minimumIntegerDigits: 1 as const } (subsumed solitary)",
      ],
      source:
        "Intl.NumberFormat('en', { 'style': 'decimal', minimumIntegerDigits: 1 as const, maximumFractionDigits: 2 })",
    },
  ])(
    'skips an option of Intl set to its default in $source',
    ({ expected, source }) => {
      expect(listSkipped('object-property', source)).toStrictEqual(expected)
      expect(
        listSkipped('object-property', source, { preset: 'strict' }),
      ).toStrictEqual(
        expected.filter(line => line.endsWith('(equivalent default-option)')),
      )
    },
  )

  it.each<{ expected: string[]; source: string; file?: string }>([
    {
      expected: ["{ type: 'ordinal' } -> {} (subsumed solitary)"],
      source: "new Intl.PluralRules('en', { type: 'ordinal' })",
    },
    {
      source:
        "let Intl = globalThis.Intl; new Intl.PluralRules('en', { type: 'cardinal' })",
      expected: ["{ type: 'cardinal' } -> {} (subsumed solitary)"],
    },
    {
      expected: [
        "{ type: 'ordinal', type: 'cardinal' } -> { type: 'cardinal' } (subsumed solitary)",
        "{ type: 'ordinal', type: 'cardinal' } -> { type: 'ordinal' } (subsumed solitary)",
      ],
      source:
        "new Intl.PluralRules('en', { type: 'ordinal', type: 'cardinal' })",
      file: 'example.js',
    },
    {
      expected: [
        "{ ...base, type: 'cardinal' } -> { ...base } (subsumed solitary)",
      ],
      source: "new Intl.PluralRules('en', { ...base, type: 'cardinal' })",
    },
    {
      expected: [
        "{ __proto__: base, type: 'cardinal' } -> { __proto__: base } (subsumed solitary)",
      ],
      source:
        "new Intl.PluralRules('en', { __proto__: base, type: 'cardinal' })",
    },
    {
      expected: [
        "{ [name]: 1, type: 'cardinal' } -> { type: 'cardinal' } (subsumed solitary)",
        "{ [name]: 1, type: 'cardinal' } -> { [name]: 1 } (subsumed solitary)",
      ],
      source: "new Intl.PluralRules('en', { [name]: 1, type: 'cardinal' })",
    },
    {
      expected: ["{ type: 'cardinal' } -> {} (subsumed solitary)"],
      source: "new Intl.PluralRules({ type: 'cardinal' })",
    },
    {
      source: "new Intl.PluralRules(...locales, { type: 'cardinal' })",
      expected: ["{ type: 'cardinal' } -> {} (subsumed solitary)"],
    },
    {
      expected: ["{ calendar: 'gregory' } -> {} (subsumed solitary)"],
      source: "new Intl.Locale('en', { calendar: 'gregory' })",
    },
    {
      expected: [
        "{ get type() { return 'cardinal' } } -> {} (subsumed solitary)",
      ],
      source:
        "new Intl.PluralRules('en', { get type() { return 'cardinal' } })",
    },
    {
      source: "let type = 'cardinal'; new Intl.PluralRules('en', { type })",
      expected: [],
    },
    {
      expected: [
        "{ style: 'decimal', get minimumIntegerDigits() { return this.style === 'decimal' ? 2 : 1 } } -> { get minimumIntegerDigits() { return this.style === 'decimal' ? 2 : 1 } } (subsumed solitary)",
        "{ style: 'decimal', get minimumIntegerDigits() { return this.style === 'decimal' ? 2 : 1 } } -> { style: 'decimal' } (subsumed solitary)",
      ],
      source:
        "new Intl.NumberFormat('en', { style: 'decimal', get minimumIntegerDigits() { return this.style === 'decimal' ? 2 : 1 } })",
    },
  ])(
    'keeps the default-option rule off in $source',
    ({ expected, source, file }) => {
      expect(
        listSkipped('object-property', source, file ? { file } : {}),
      ).toStrictEqual(expected)
    },
  )
})
