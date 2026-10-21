import { describe, expect, it } from 'vitest'

import type { MutatorSetup } from '../../helpers/generate-candidates'

import { generateMutants } from '../../helpers/generate-mutants'
import { formatMutant } from '../../helpers/format-mutant'
import { listSkipped } from '../../helpers/list-skipped'
import { runMutator } from '../../helpers/run-mutator'

describe('arrayElement', () => {
  it.each<{ expected: string[]; source: string }>([
    {
      expected: [
        '[a, b, ...more] -> [b, ...more]',
        '[a, b, ...more] -> [a, ...more]',
        '[a, b, ...more] -> [a, b]',
      ],
      source: 'x = [a, b, ...more]',
    },
    {
      expected: ['[] -> [undefined]'],
      source: 'x = []',
    },
    {
      source: 'x = [1, 2]',
      expected: [],
    },
    {
      expected: [
        '[user, [inner, 4], other] -> [[inner, 4], other]',
        '[user, [inner, 4], other] -> [user, [inner, 4]]',
        '[inner, 4] -> [4]',
      ],
      source: 'x = [user, [inner, 4], other]',
    },
    {
      expected: ['[ only ] -> []'],
      source: 'x = [ only ]',
    },
    {
      expected: ['[a?.b, c] -> [c]', '[a?.b, c] -> [a?.b]'],
      source: 'x = [a?.b, c]',
    },
    {
      source: 'useEffect(load, [])',
      expected: [],
    },
  ])('mutates $source as in the catalog', ({ expected, source }) => {
    expect(runMutator('array-element', source).map(formatMutant)).toStrictEqual(
      expected,
    )
  })

  it.each<{ expected: string[]; source: string }>([
    {
      expected: [
        '[\n  first,\n  second,\n] -> [\n  second,\n]',
        '[\n  first,\n  second,\n] -> [\n  first,\n]',
      ],
      source: ['x = [', '  first,', '  second,', ']'].join('\n'),
    },
    {
      expected: ['[a /* c */, b] -> [b]', '[a /* c */, b] -> [a /* c */]'],
      source: 'x = [a /* c */, b]',
    },
    {
      expected: ['[] -> [undefined]'],
      source: 'x = useState([])',
    },
    {
      expected: ['[] -> [undefined]'],
      source: 'x = user(load, [])',
    },
    {
      source: 'x = useEffect([], load)',
      expected: ['[] -> [undefined]'],
    },
    {
      source: 'x = factory().useMemo(load, [])',
      expected: [],
    },
    {
      source: "x = hooks['useMemo'](load, [])",
      expected: ['[] -> [undefined]'],
    },
    {
      source: 'x = React.useMemo(load, [] as const)',
      expected: [],
    },
    {
      source: 'x = use2(load, [])',
      expected: [],
    },
    {
      source: 'x = [a, , b]',
      expected: [],
    },
    {
      source: 'x = [, a]',
      expected: [],
    },
    {
      source: 'x = new Array(a, b)',
      expected: [],
    },
    {
      source: 'x = Array(a, b)',
      expected: [],
    },
    {
      source: 'let [a, b] = list',
      expected: [],
    },
  ])('handles $source', ({ expected, source }) => {
    expect(runMutator('array-element', source).map(formatMutant)).toStrictEqual(
      expected,
    )
  })

  it.each<{ setup: MutatorSetup; source: string }>([
    {
      source: [
        '// mootant-ignore-next-line number-literal: fixed values',
        'x = [1, 2]',
      ].join('\n'),
      setup: {},
    },
    {
      setup: { mutators: { 'number-literal': 'off' } },
      source: 'x = [1, 2]',
    },
  ])(
    'removes an element whose own mutant will not run in $source',
    ({ source, setup }) => {
      expect(
        runMutator('array-element', source, setup).map(formatMutant),
      ).toStrictEqual(['[1, 2] -> [2]', '[1, 2] -> [1]'])
    },
  )

  it('keeps an ignored removal when the element mutant runs', () => {
    let source = [
      '// mootant-ignore-next-line array-element',
      'x = [1, item]',
    ].join('\n')

    expect(
      runMutator('array-element', source).map(mutant => mutant.status),
    ).toStrictEqual(['Ignored'])
  })

  it.each<[string, string[]]>([
    [
      'useEffect(() => {}, []); a = []; b = [1, , 2]',
      ['[] -> [undefined] (equivalent hook-dependencies)'],
    ],
  ])('lists the skipped mutants of %s', (source, expected) => {
    expect(listSkipped('array-element', source)).toStrictEqual(expected)
  })

  it.each(['recommended', 'strict'])(
    'skips the undefined of an array that is only pushed to and joined with an empty separator under %s',
    preset => {
      let source = [
        'function text(items: string[]) {',
        '  let parts: string[] = []',
        '  for (let item of items) parts.push(item)',
        "  return parts.join('')",
        '}',
      ].join('\n')

      expect(
        runMutator('array-element', source, { preset }).map(formatMutant),
      ).toStrictEqual([])
      expect(listSkipped('array-element', source, { preset })).toStrictEqual([
        '[] -> [undefined] (equivalent joined-array)',
      ])
    },
  )

  it.each<{ source: string; title: string; file?: string }>([
    {
      source: [
        'function text(items: string[], undefined: string) {',
        '  let parts: string[] = []',
        '  for (let item of items) parts.push(item)',
        "  return parts.join('')",
        '}',
      ].join('\n'),
      title: 'a parameter of a joined array',
    },
    {
      source: [
        'function text(items: string[]) {',
        "  let undefined = 'x'",
        '  let parts: string[] = []',
        '  for (let item of items) parts.push(item)',
        "  return parts.join('')",
        '}',
      ].join('\n'),
      title: 'a local of a joined array',
    },
    {
      source: [
        'function text(items: string[]) {',
        '  try {',
        '    return check(items)',
        '  } catch (undefined) {',
        '    let parts = []',
        '    parts.push(items[0])',
        "    return parts.join('')",
        '  }',
        '}',
      ].join('\n'),
      title: 'a catch parameter of a joined array',
    },
    {
      source: [
        "import { sep as undefined } from 'node:path'",
        'export function text(items: string[]) {',
        '  let parts: string[] = []',
        '  for (let item of items) parts.push(item)',
        "  return parts.join('')",
        '}',
      ].join('\n'),
      title: 'an import elsewhere in the file of a joined array',
    },
    {
      source: [
        '<script>',
        'const undefined = 1',
        'export default {}',
        '</script>',
        '<script setup>',
        'function text(items) {',
        '  let parts = []',
        '  for (let item of items) parts.push(item)',
        "  return parts.join('')",
        '}',
        '</script>',
      ].join('\n'),
      title: 'another script block of a component with a joined array',
      file: 'Shadow.vue',
    },
    {
      source: [
        'export function useCounter(undefined: unknown, log: string[]) {',
        "  useEffect(() => { log.push('effect') }, [])",
        '}',
      ].join('\n'),
      title: 'a parameter of a hook call',
    },
    {
      source: 'function watch(scope) { with (scope) { useEffect(load, []) } }',
      title: 'a with statement around a hook call',
      file: 'a.js',
    },
    {
      source: 'eval(code); useEffect(load, [])',
      title: 'a direct eval beside a hook call',
    },
    {
      source: [
        'namespace undefined.Inner {',
        '  export const x = 1',
        '}',
        'export function text(): string {',
        '  const parts: string[] = []',
        "  parts.push('x')",
        "  return parts.join('')",
        '}',
      ].join('\n'),
      title:
        'a dotted namespace that starts with undefined beside a joined array',
    },
    {
      source: [
        'export namespace App {',
        '  export function text(): string {',
        '    const parts: string[] = []',
        "    parts.push('x')",
        "    return parts.join('')",
        '  }',
        '}',
      ].join('\n'),
      title: 'a namespace body with a joined array',
    },
  ])(
    'keeps the undefined of an empty array where $title may bind undefined',
    ({ file = 'example.ts', source }) => {
      expect(
        generateMutants(source, { file })
          .filter(mutant => mutant.mutator === 'array-element')
          .map(mutant => mutant.replacement),
      ).toStrictEqual(['[undefined]'])
      expect(listSkipped('array-element', source, { file })).toStrictEqual([])
    },
  )

  it.each([
    "function text() { let parts = []; parts.push(a); return parts.join(',') }",
    "function size() { let parts = []; parts.push(a); parts.join(''); return parts.length }",
    "export const parts = []; export function text() { parts.push(a); return parts.join('') }",
  ])('keeps the undefined of an array that is read otherwise in %s', source => {
    expect(runMutator('array-element', source).map(formatMutant)).toStrictEqual(
      ['[] -> [undefined]'],
    )
  })
})
