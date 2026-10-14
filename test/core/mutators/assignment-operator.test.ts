import { describe, expect, it } from 'vitest'

import type { MutatorSetup } from '../../helpers/generate-mutants'

import { listSkipped } from '../../helpers/list-skipped'
import { runMutator } from '../../helpers/run-mutator'

describe('assignmentOperator', () => {
  it.each<{
    expected: { replacement: string; original: string }[]
    setup?: MutatorSetup
    source: string
  }>([
    {
      expected: [
        { replacement: 'total -= step', original: 'total += step' },
        { replacement: 'n ||= step', original: 'n ??= step' },
        { original: 'n ??= step', replacement: 'n' },
        { replacement: 'name = label', original: 'name ||= label' },
        { replacement: 'name ??= label', original: 'name ||= label' },
        { replacement: 'list = []', original: 'list ??= []' },
        { original: 'list ??= []', replacement: 'list' },
      ],
      source: [
        'function f(',
        '  total: number,',
        '  step: number,',
        '  label: string,',
        '  suffix: string,',
        '  n: number | undefined,',
        '  name: string | undefined,',
        '  list: string[] | undefined,',
        ') {',
        '  total += step',
        '  label += suffix',
        '  n ??= step',
        '  name ||= label',
        '  list ??= []',
        '}',
      ].join('\n'),
    },
    {
      expected: [
        {
          replacement: 'cache.value = compute()',
          original: 'cache.value ||= compute()',
        },
        { original: 'cache.value ||= compute()', replacement: 'cache.value' },
        { replacement: '(a) = b', original: '(a) ||= b' },
        { original: '(a) ||= b', replacement: '(a)' },
      ],
      source: ['cache.value ||= compute()', ';(a) ||= b', 'mask <<= 0'].join(
        '\n',
      ),
      setup: { file: 'example.js' },
    },
    {
      expected: [
        {
          replacement: 'cache.value = compute()',
          original: 'cache.value ||= compute()',
        },
        {
          replacement: 'cache.value ??= compute()',
          original: 'cache.value ||= compute()',
        },
      ],
      setup: { file: 'example.js', preset: 'strict' },
      source: 'cache.value ||= compute()',
    },
    {
      expected: [
        {
          replacement: 'cache.value = compute()',
          original: 'cache.value ||= compute()',
        },
        {
          replacement: 'cache.value ??= compute()',
          original: 'cache.value ||= compute()',
        },
      ],
      setup: {
        mutators: { 'assignment-operator': ['on', { nullishSwap: 'always' }] },
        file: 'example.js',
      },
      source: 'cache.value ||= compute()',
    },
    {
      expected: [
        { replacement: '(a /* ) */) = b', original: '(a /* ) */) ||= b' },
        { original: '(a /* ) */) ||= b', replacement: '(a)' },
        { replacement: '((c)) = d', original: '((c)) &&= d' },
        { original: '((c)) &&= d', replacement: '((c))' },
      ],
      source: ['(a /* ) */) ||= b', ';((c)) &&= d'].join('\n'),
      setup: { file: 'example.js' },
    },
  ])('mutates $source', ({ expected, source, setup }) => {
    expect(runMutator('assignment-operator', source, setup)).toMatchObject(
      expected,
    )
  })

  it.each([
    { replacement: 'n -= 1', original: 'n += 1' },
    { replacement: 'n += 1', original: 'n -= 1' },
    { replacement: 'n /= 2', original: 'n *= 2' },
    { replacement: 'n *= 2', original: 'n /= 2' },
    { replacement: 'n *= 2', original: 'n %= 2' },
    { replacement: 'n *= 2', original: 'n **= 2' },
    { replacement: 'n >>= 1', original: 'n <<= 1' },
    { replacement: 'n <<= 1', original: 'n >>= 1' },
    { replacement: 'n >>= 1', original: 'n >>>= 1' },
    { replacement: 'n |= 1', original: 'n &= 1' },
    { replacement: 'n &= 1', original: 'n |= 1' },
    { replacement: 'n |= 1', original: 'n ^= 1' },
    { replacement: 'n >>= 0', original: 'n >>>= 0' },
    { replacement: 'n &= 0', original: 'n |= 0' },
    { replacement: 'n *= 1', original: 'n %= 1' },
    { replacement: 'x += 0', original: 'x -= 0' },
    { replacement: 'x -= 1', original: 'x += 1' },
  ])('swaps $original', ({ replacement, original }) => {
    let source = `function f(n: number, x) { ${original} }`

    expect(runMutator('assignment-operator', source)).toMatchObject([
      { replacement, original },
    ])
  })

  it.each([
    'n += 0',
    'n -= 0',
    'n *= 1',
    'n /= -1',
    'm *= 1n',
    'm /= -1n',
    'n **= 1',
    'n **= 1n',
    'n <<= 0',
    'n >>= 0',
    'n ^= 0',
    'm += 0n',
    'x += y',
    's += 1',
  ])('skips %s', line => {
    let source = `function f(n: number, m: bigint, s: string, x) { ${line} }`

    expect(runMutator('assignment-operator', source)).toEqual([])
  })

  it.each<{ expected: string[]; preset: string; line: string }>([
    { preset: 'recommended', line: 'o &&= x', expected: ['o'] },
    { preset: 'recommended', line: "s &&= ''", expected: ['s'] },
    { preset: 'recommended', expected: ['u = x'], line: 'u &&= x' },
    { preset: 'recommended', line: 'b &&= false', expected: ['b'] },
    { preset: 'recommended', expected: ['o = x'], line: 'o ||= x' },
    { preset: 'recommended', expected: ["s = ''"], line: "s ||= ''" },
    { preset: 'recommended', line: 'u ||= x', expected: ['u'] },
    { expected: ['n = 0', 'n'], preset: 'recommended', line: 'n ??= 0' },
    { expected: ['n ||= 0', 'n'], preset: 'strict', line: 'n ??= 0' },
    { preset: 'recommended', line: 'u ??= x', expected: ['u'] },
    { preset: 'recommended', expected: ['o = x'], line: 'o ??= x' },
    { expected: ["s = 'a'", 's'], preset: 'recommended', line: "s ||= 'a'" },
    { expected: ['b = false'], preset: 'recommended', line: 'b ||= false' },
    { expected: ['b = false'], line: 'b ||= false', preset: 'strict' },
  ])('mutates $line with $preset', ({ expected, preset, line }) => {
    let source = [
      'function f(',
      '  o: object,',
      '  s: string,',
      '  u: undefined,',
      '  x: string,',
      '  n: number | undefined,',
      '  b: boolean,',
      ') {',
      `  ${line}`,
      '}',
    ].join('\n')

    expect(
      runMutator('assignment-operator', source, { preset }).map(
        mutant => mutant.replacement,
      ),
    ).toEqual(expected)
  })

  it.each<{ setup: MutatorSetup }>([
    { setup: { settings: { timeouts: true } } },
    { setup: { preset: 'strict' } },
  ])('swaps an assignment that advances a loop with $setup', ({ setup }) => {
    let source = [
      'function f(n: number, i: number) {',
      '  while (i < n) i += 2',
      '}',
    ].join('\n')

    expect(runMutator('assignment-operator', source)).toEqual([])
    expect(runMutator('assignment-operator', source, setup)).toMatchObject([
      { replacement: 'i -= 2', original: 'i += 2' },
    ])
  })

  it.each<{
    expected: { replacement: string; original: string }[]
    mutator: string
    source: string
  }>([
    {
      expected: [{ replacement: '1', original: '0' }],
      mutator: 'number-literal',
      source: 'mask <<= 0',
    },
    {
      source: 'function f(label: string, suffix: string) { label += suffix }',
      expected: [{ original: 'label += suffix', replacement: ';' }],
      mutator: 'statement-removal',
    },
  ])('leaves $source to $mutator', ({ expected, mutator, source }) => {
    expect(runMutator(mutator, source)).toMatchObject(expected)
    expect(runMutator('assignment-operator', source)).toEqual([])
  })

  it.each<{ setup: MutatorSetup; source: string }>([
    {
      source: [
        'function f(total: number, step: number) {',
        '  // mootant-ignore-next-line assignment-operator',
        '  total += step',
        '}',
      ].join('\n'),
      setup: {},
    },
    {
      source: 'function f(total: number, step: number) { total += step }',
      setup: { mutators: { 'assignment-operator': 'off' } },
    },
  ])(
    'brings back the statement removal without the swap in $source',
    ({ source, setup }) => {
      expect(
        runMutator(
          'statement-removal',
          'function f(total: number, step: number) { total += step }',
        ),
      ).toEqual([])
      expect(runMutator('statement-removal', source, setup)).toMatchObject([
        { original: 'total += step', replacement: ';' },
      ])
    },
  )

  it.each<[string, string[]]>([
    [
      "declare let n: number; declare let s: string; n += 0; s += 'x'; n <<= 0; n *= 1; n -= 0",
      [
        'n += 0 -> n -= 0 (equivalent numeric-identity)',
        "s += 'x' -> s -= 'x' (noise non-numeric-plus)",
        'n <<= 0 -> n >>= 0 (equivalent identity-operand)',
        'n *= 1 -> n /= 1 (equivalent identity-operand)',
        'n -= 0 -> n += 0 (equivalent numeric-identity)',
      ],
    ],
    [
      "declare let u: string; declare let v: number | undefined; declare let w: null; u ??= 'x'; v ??= 0; w ??= 1",
      [
        "u ??= 'x' -> u = 'x' (subsumed swap-subsumes-drop)",
        "u ??= 'x' -> u (equivalent never-nullish)",
        'v ??= 0 -> v ||= 0 (noise nullish-swap)',
        'w ??= 1 -> w ||= 1 (noise nullish-swap)',
        'w ??= 1 -> w = 1 (equivalent typed-constant)',
      ],
    ],
    [
      'declare let b: boolean | undefined; declare let c: boolean; declare let o: object; declare let w: null; b ||= true; c ||= false; o ||= {}; w ||= 1',
      [
        'b ||= true -> b (subsumed swap-subsumes-drop)',
        'c ||= false -> c (equivalent canonical-falsy-default)',
        'o ||= {} -> o (equivalent typed-constant)',
        'w ||= 1 -> w = 1 (equivalent typed-constant)',
        'w ||= 1 -> w ??= 1 (noise nullish-swap)',
      ],
    ],
    [
      'declare let o: object; declare let w: null; o &&= {}; w &&= 1',
      [
        'o &&= {} -> o = {} (equivalent typed-constant)',
        'w &&= 1 -> w (equivalent typed-constant)',
      ],
    ],
    [
      'declare let n: number; for (let i = 0; i < 9; i += 1) {} for (let j = 0; j < 9; j += 0) {}',
      [
        'i += 1 -> i -= 1 (timeout loop-advance)',
        'j += 0 -> j -= 0 (equivalent numeric-identity)',
      ],
    ],
  ])('lists the skipped mutants of %s', (source, expected) => {
    expect(listSkipped('assignment-operator', source)).toStrictEqual(expected)
  })
})
