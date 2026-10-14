import { describe, expect, it } from 'vitest'

import type { MutatorSetup } from '../../helpers/generate-mutants'

import { formatMutant } from '../../helpers/format-mutant'
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
})
