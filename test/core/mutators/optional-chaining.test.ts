import { describe, expect, it } from 'vitest'

import type { MutatorSetup } from '../../helpers/generate-candidates'

import { createMutatorRegistry } from '../../../core/plugins/create-mutator-registry'
import { generateFileMutants } from '../../../core/generate/generate-file-mutants'
import { resolvePreset } from '../../../core/plugins/resolve-preset'
import { corePlugin } from '../../../core/plugins/core-plugin'
import { formatMutant } from '../../helpers/format-mutant'
import { listSkipped } from '../../helpers/list-skipped'
import { runMutator } from '../../helpers/run-mutator'

/**
 * Declarations of the catalog examples.
 */
const DECLARATIONS = [
  'interface User { name: string }',
  'interface Data { items: { title: string }[] }',
  'type MaybeUser = User | null',
].join('\n')

describe('optionalChaining', () => {
  it.each<{ expected: string[]; source: string }>([
    {
      source: 'function f(user: User | undefined) { x = user?.name }',
      expected: ['user?.name -> user.name'],
    },
    {
      source: "function f(user: User | undefined) { x = user?.['key'] }",
      expected: ["user?.['key'] -> user['key']"],
    },
    {
      source: 'function f(callback?: () => void) { callback?.() }',
      expected: ['callback?.() -> callback()'],
    },
    {
      source: 'function f(maybe: MaybeUser) { x = maybe?.name }',
      expected: ['maybe?.name -> maybe.name'],
    },
    {
      source:
        'function f<T extends User | undefined>(generic: T) { x = generic?.name }',
      expected: ['generic?.name -> generic.name'],
    },
    {
      source: 'function f(list: string[]) { x = list?.length }',
      expected: [],
    },
    {
      source: 'function f(user: User) { x = user?.name }',
      expected: [],
    },
    {
      source: 'x = 1?.toString()',
      expected: [],
    },
    {
      expected: [
        'data?.items?.[0]?.title -> data.items?.[0]?.title',
        'data?.items?.[0]?.title -> data?.items[0]?.title',
        'data?.items?.[0]?.title -> data?.items?.[0].title',
      ],
      source:
        'function f(data: Data | undefined) { x = data?.items?.[0]?.title }',
    },
    {
      expected: ['value?.trim().toLowerCase() -> value.trim().toLowerCase()'],
      source: 'x = value?.trim().toLowerCase()',
    },
  ])('mutates $source as in the catalog', ({ expected, source }) => {
    expect(
      runMutator('optional-chaining', [DECLARATIONS, source].join('\n')).map(
        formatMutant,
      ),
    ).toStrictEqual(expected)
  })

  it('removes a link whose object has an imported type, which may be nullable', () => {
    let source = [
      "import type { User } from './user'",
      'function f(user: User) {',
      '  x = user?.name',
      '}',
    ].join('\n')

    expect(
      runMutator('optional-chaining', source).map(formatMutant),
    ).toStrictEqual(['user?.name -> user.name'])
  })

  it.each<{ expected: string[]; source: string }>([
    {
      expected: ['a?.b!.c?.d -> a.b!.c?.d', 'a?.b!.c?.d -> a?.b!.c.d'],
      source: 'x = a?.b!.c?.d',
    },
    {
      expected: ['(a)?.b -> (a).b'],
      source: 'x = (a)?.b',
    },
    {
      expected: ['a /* c */ ?.b -> a /* c */ .b'],
      source: 'x = a /* c */ ?.b',
    },
    {
      expected: ['f?.<string>(a) -> f<string>(a)'],
      source: 'x = f?.<string>(a)',
    },
    {
      expected: ['a?.[b?.c] -> a[b?.c]', 'b?.c -> b.c'],
      source: 'x = a?.[b?.c]',
    },
    {
      expected: ['(a?.b)?.c -> (a?.b).c', 'a?.b -> a.b'],
      source: 'x = (a?.b)?.c',
    },
    {
      source: 'class A { f() { return this?.x } }',
      expected: [],
    },
  ])('handles $source', ({ expected, source }) => {
    expect(
      runMutator('optional-chaining', source).map(formatMutant),
    ).toStrictEqual(expected)
  })

  it.each([
    ['delete a?.b'],
    ['delete obj?.[key]'],
    ['function f(o) { delete o?.cache[key] }'],
    ['(a?.b)()'],
  ])('replaces no chain the switch cannot wrap in %s', source => {
    expect(
      runMutator('optional-chaining', source, { file: 'example.js' }),
    ).toStrictEqual([])
  })

  it.each<{ setup: MutatorSetup }>([
    {
      setup: {
        mutators: { 'optional-chaining': ['on', { nonNullable: true }] },
      },
    },
    { setup: { preset: 'strict' } },
  ])('replaces links of non-nullable objects with $setup', ({ setup }) => {
    let source = [
      'function f(list: string[]) {',
      '  x = list?.length',
      '  y = 1?.toString()',
      '}',
    ].join('\n')

    expect(
      runMutator('optional-chaining', source, setup).map(formatMutant),
    ).toStrictEqual([
      'list?.length -> list.length',
      '1?.toString() -> 1 .toString()',
    ])
  })

  it('comes before the statement removal of the same range', () => {
    let registry = createMutatorRegistry(corePlugin, {})
    let { mutators, settings } = resolvePreset(registry, 'recommended')
    let { mutants } = generateFileMutants({
      knownMutatorIds: new Set(registry.mutators.keys()),
      source: 'callback?.()',
      file: 'example.ts',
      settings,
      mutators,
    })

    expect(mutants).toMatchObject([
      { mutator: 'optional-chaining', replacement: 'callback()', start: 0 },
      { mutator: 'statement-removal', replacement: ';', start: 0 },
    ])
    expect(mutants.map(mutant => mutant.end)).toStrictEqual([12, 12])
  })

  it.each<[string, string[]]>([
    [
      'declare let ok: { name: string }; use(ok?.name)',
      ['ok?.name -> ok.name (equivalent non-nullable)'],
    ],
    ['delete user?.name', ['user?.name -> user.name (invalid invalid-target)']],
    ['use(user?.name)', []],
  ])('lists the skipped mutants of %s', (source, expected) => {
    expect(listSkipped('optional-chaining', source)).toStrictEqual(expected)
  })

  it.each<{ setup: MutatorSetup }>([
    { setup: {} },
    {
      setup: {
        mutators: { 'optional-chaining': ['on', { nonNullable: true }] },
      },
    },
    { setup: { preset: 'strict' } },
  ])(
    'keeps the links after the groups of a regex match with $setup',
    ({ setup }) => {
      let source = [
        'function key(text: string) {',
        '  let match = text.match(/(?<key>[^:]+):/u)',
        "  return match?.groups?.['key']?.trim()",
        '}',
      ].join('\n')

      expect(
        runMutator('optional-chaining', source, setup).map(formatMutant),
      ).toStrictEqual([
        "match?.groups?.['key']?.trim() -> match.groups?.['key']?.trim()",
      ])
      expect(listSkipped('optional-chaining', source, setup)).toStrictEqual([
        "match?.groups?.['key']?.trim() -> match?.groups['key']?.trim() (equivalent named-groups)",
        "match?.groups?.['key']?.trim() -> match?.groups?.['key'].trim() (equivalent named-groups)",
      ])
    },
  )

  it.each<{ expected: string[]; source: string }>([
    {
      expected: [
        "/(?:x(?<tail>y))?z/u.exec(text)?.groups?.['tail']?.trim() -> /(?:x(?<tail>y))?z/u.exec(text).groups?.['tail']?.trim()",
        "/(?:x(?<tail>y))?z/u.exec(text)?.groups?.['tail']?.trim() -> /(?:x(?<tail>y))?z/u.exec(text)?.groups?.['tail'].trim()",
      ],
      source:
        "function tail(text: string) { return /(?:x(?<tail>y))?z/u.exec(text)?.groups?.['tail']?.trim() }",
    },
    {
      expected: [
        String.raw`text.match(/(?<word>\w+)/gu)?.groups?.['word'] -> text.match(/(?<word>\w+)/gu).groups?.['word']`,
        String.raw`text.match(/(?<word>\w+)/gu)?.groups?.['word'] -> text.match(/(?<word>\w+)/gu)?.groups['word']`,
      ],
      source: String.raw`function word(text: string) { return text.match(/(?<word>\w+)/gu)?.groups?.['word'] }`,
    },
  ])(
    'replaces the links that a match may leave nullish in $source',
    ({ expected, source }) => {
      expect(
        runMutator('optional-chaining', source).map(formatMutant),
      ).toStrictEqual(expected)
    },
  )
})
