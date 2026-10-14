import { describe, expect, it } from 'vitest'

import type { MutatorSetup } from '../../helpers/generate-mutants'

import { runMutator } from '../../helpers/run-mutator'

describe('arithmeticOperator', () => {
  it.each<{
    expected: { replacement: string; original: string }[]
    setup?: MutatorSetup
    source: string
  }>([
    {
      source: [
        'function f(count: number, rate: number, first: string, last: string) {',
        '  a = count * rate',
        '  b = count + rate',
        '  c = first + last',
        "  d = first + '!'",
        '  e = rate ** 1',
        '}',
      ].join('\n'),
      expected: [
        { replacement: 'count / rate', original: 'count * rate' },
        { replacement: 'count - rate', original: 'count + rate' },
        { original: 'first + last', replacement: 'first' },
      ],
    },
    {
      expected: [{ original: 'a + b', replacement: 'a' }],
      source: 'function add(a, b) { return a + b }',
      setup: { file: 'example.js' },
    },
    {
      expected: [
        { replacement: 'a * b ** 2', original: 'a / b ** 2' },
        { replacement: 'b * 2', original: 'b ** 2' },
        { replacement: 'a+-b + c+ +d', original: 'a+-b + c-+d' },
        { original: 'a+-b + c', replacement: 'a+-b' },
        { replacement: 'a/ /re/.source', original: 'a*/re/.source' },
        { replacement: 'a+ ++b', original: 'a-++b' },
      ],
      source: [
        'x = a / b ** 2',
        'y = a+-b + c-+d',
        'z = a*/re/.source',
        'u = a-++b',
      ].join('\n'),
    },
    {
      source: [
        'function f(n: number, b, c: number) {',
        '  x = n - 0',
        '  y = b - -c',
        '  z = b + -c',
        '}',
      ].join('\n'),
      expected: [],
    },
    {
      expected: [{ replacement: 's + 0', original: 's - 0' }],
      setup: { file: 'example.js' },
      source: 'x = s - 0',
    },
    {
      source: "function f(id) { throw new Error('bad ' + id) }",
      expected: [],
    },
  ])('mutates $source', ({ expected, source, setup }) => {
    expect(runMutator('arithmetic-operator', source, setup)).toMatchObject(
      expected,
    )
  })

  it.each([
    'a = n + 0',
    'b = n * 1',
    'c = n / -1',
    'd = m * 1n',
    'e = m / -1n',
    'g = n ** 1',
    'h = n ** 1n',
    'i = n + 0n',
    'j = n - (0)',
  ])('skips the identity %s', line => {
    let source = `function f(n: number, m: bigint) { ${line} }`

    expect(runMutator('arithmetic-operator', source)).toEqual([])
  })

  it.each([
    { replacement: 'n * 1', original: 'n % 1' },
    { replacement: 'n + 1', original: 'n - 1' },
    { replacement: 'n / 2', original: 'n * 2' },
    { replacement: 'n * 2', original: 'n / 2' },
    { replacement: 'n * 2', original: 'n ** 2' },
    { replacement: 'n - -1', original: 'n + -1' },
    { replacement: 'x + 0n', original: 'x - 0n' },
    { replacement: 'n - 2', original: 'n + 2' },
  ])('swaps $original', ({ replacement, original }) => {
    let source = `function f(n: number) { y = ${original} }`

    expect(runMutator('arithmetic-operator', source)).toMatchObject([
      { replacement, original },
    ])
  })

  it.each([
    {
      expected: [
        {
          original: 'String(a + b) + (a as any)',
          replacement: 'String(a + b)',
        },
        { replacement: 'a - b', original: 'a + b' },
      ],
      source:
        'function f(a: number, b: number) { return String(a + b) + (a as any) }',
    },
    {
      source: "function f(a) { return a + ('x' as string) }",
      expected: [],
    },
    {
      expected: [{ original: 'a + -b', replacement: 'a' }],
      source: 'function f(a: string) { return a + -b }',
    },
    {
      source: "function f(a: number) { return new Error(a + 'x' + b) }",
      expected: [],
    },
    {
      source: 'function f(a: number, b: number) { throw a + b }',
      expected: [{ replacement: 'a - b', original: 'a + b' }],
    },
  ])('drops the right operand of $source', ({ expected, source }) => {
    expect(runMutator('arithmetic-operator', source)).toMatchObject(expected)
  })

  it.each<{ setup: MutatorSetup }>([
    { setup: { settings: { timeouts: true } } },
    { setup: { preset: 'strict' } },
  ])('swaps an operator that advances a loop with $setup', ({ setup }) => {
    let source = [
      'function f(n: number) {',
      '  let i = 0',
      '  while (i < n) i = i + 1',
      '}',
    ].join('\n')

    expect(runMutator('arithmetic-operator', source)).toEqual([])
    expect(runMutator('arithmetic-operator', source, setup)).toMatchObject([
      { replacement: 'i - 1', original: 'i + 1' },
    ])
  })

  it('reports the position and kind of a mutant', () => {
    expect(runMutator('arithmetic-operator', 'x = a * b')).toEqual([
      {
        mutator: 'arithmetic-operator',
        replacement: 'a / b',
        kind: 'expression',
        original: 'a * b',
        status: 'Pending',
        reason: null,
        scope: null,
        column: 5,
        line: 1,
      },
    ])
  })

  it.each<{
    expected: { replacement: string; original: string }[]
    mutator: string
    source: string
  }>([
    {
      source: "function f(first: string) { d = first + '!' }",
      expected: [{ replacement: "''", original: "'!'" }],
      mutator: 'string-literal',
    },
    {
      source: 'function f(first: string) { d = first + `!` }',
      expected: [{ replacement: '``', original: '`!`' }],
      mutator: 'string-literal',
    },
    {
      source: 'function f(rate: number) { e = rate ** 1 }',
      expected: [{ replacement: '2', original: '1' }],
      mutator: 'number-literal',
    },
    {
      expected: [{ replacement: '1', original: '0' }],
      source: 'function f(n: number) { x = n - 0 }',
      mutator: 'number-literal',
    },
    {
      source: 'function f(b, c: number) { y = b - -c }',
      expected: [{ replacement: 'c', original: '-c' }],
      mutator: 'unary-operator',
    },
  ])('leaves $source to $mutator', ({ expected, mutator, source }) => {
    expect(runMutator(mutator, source)).toMatchObject(expected)
    expect(runMutator('arithmetic-operator', source)).toEqual([])
    expect(
      runMutator('arithmetic-operator', source, {
        mutators: { [mutator]: 'off' },
      }),
    ).toEqual([])
  })

  it.each<{ setup: MutatorSetup; source: string }>([
    {
      source: [
        'function add(a, b) {',
        '  // mootant-ignore-next-line arithmetic-operator',
        '  return a + b',
        '}',
      ].join('\n'),
      setup: { file: 'example.js' },
    },
    {
      setup: {
        mutators: { 'arithmetic-operator': 'off' },
        file: 'example.js',
      },
      source: 'function add(a, b) { return a + b }',
    },
  ])(
    'brings back the returned value removal without the drop in $source',
    ({ source, setup }) => {
      expect(
        runMutator('return-value', 'function add(a, b) { return a + b }', {
          file: 'example.js',
        }),
      ).toEqual([])
      expect(runMutator('return-value', source, setup)).toMatchObject([
        { replacement: 'undefined', original: 'a + b' },
      ])
    },
  )

  it.each<{
    expected: { replacement: string; original: string }[]
    source: string
  }>([
    {
      expected: [{ original: 'a + b + b', replacement: 'a + b' }],
      source: 'x = a + b + b',
    },
    {
      expected: [
        { original: 'a + b + c', replacement: 'a + b' },
        { original: 'a + b', replacement: 'a' },
      ],
      source: 'x = a + b + c',
    },
  ])(
    'keeps one of the drops that give the same program in $source',
    ({ expected, source }) => {
      expect(
        runMutator('arithmetic-operator', source, { file: 'example.js' }),
      ).toMatchObject(expected)
    },
  )
})
