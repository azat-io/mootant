import { describe, expect, it } from 'vitest'

import type { MutatorSetup } from '../../helpers/generate-mutants'

import { formatMutant } from '../../helpers/format-mutant'
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
})
