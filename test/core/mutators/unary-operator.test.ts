import { describe, expect, it } from 'vitest'

import { listSkipped } from '../../helpers/list-skipped'
import { runMutator } from '../../helpers/run-mutator'

describe('unaryOperator', () => {
  it.each<{
    expected: { replacement: string; original: string }[]
    line: string
  }>([
    { expected: [{ replacement: 'x', original: '-x' }], line: 'y = -x' },
    { expected: [{ replacement: 's', original: '+s' }], line: 'y = +s' },
    { line: 'y = +x', expected: [] },
    {
      expected: [{ replacement: 'mask', original: '~mask' }],
      line: 'y = ~mask',
    },
    { expected: [{ replacement: 'x', original: '~~x' }], line: 'y = ~~x' },
    {
      expected: [{ replacement: '(x)', original: '~~(x)' }],
      line: 'y = ~~(x)',
    },
    {
      expected: [
        { replacement: '~x', original: '-~x' },
        { replacement: 'x', original: '~x' },
      ],
      line: 'y = -~x',
    },
    {
      expected: [
        { replacement: '(~x)', original: '-(~x)' },
        { replacement: 'x', original: '~x' },
      ],
      line: 'y = -(~x)',
    },
    { line: 'y = -1', expected: [] },
    { line: 'y = -1n', expected: [] },
    {
      expected: [{ replacement: '(a + b)', original: '-(a + b)' }],
      line: 'y = -(a + b)',
    },
    { expected: [{ replacement: 'u', original: '+u' }], line: 'y = +u' },
    {
      expected: [{ replacement: 'big', original: '+big' }],
      line: 'y = +big',
    },
    {
      expected: [{ replacement: 'n', original: '+n' }],
      line: 'y = +n',
    },
    {
      expected: [{ replacement: 'm', original: '+m' }],
      line: 'y = +m',
    },
    { line: 'y = +1', expected: [] },
    { line: 'y = +(1)', expected: [] },
    { line: "y = +'5'", expected: [] },
    {
      expected: [{ original: '~(~x)', replacement: 'x' }],
      line: 'y = ~(~x)',
    },
    {
      expected: [
        { replacement: '-x', original: '- -x' },
        { replacement: 'x', original: '-x' },
      ],
      line: 'y = - -x',
    },
    {
      expected: [{ replacement: 'true', original: '-true' }],
      line: 'y = -true',
    },
    { line: 'y = !x', expected: [] },
    { line: 'y = typeof x', expected: [] },
    { line: 'y = void x', expected: [] },
    { line: 'delete o.k', expected: [] },
  ])('mutates $line', ({ expected, line }) => {
    let source = [
      'function f(',
      '  x: number,',
      '  s: string,',
      '  big: bigint,',
      '  u,',
      '  o: object,',
      '  n: number | null,',
      '  m?: number,',
      ') {',
      `  ${line}`,
      '}',
    ].join('\n')

    expect(runMutator('unary-operator', source)).toMatchObject(expected)
  })

  it('leaves a negative number literal to number-literal', () => {
    let source = 'y = -1'

    expect(runMutator('number-literal', source)).toMatchObject([
      { replacement: '0', original: '-1' },
    ])
    expect(runMutator('unary-operator', source)).toEqual([])
  })

  it.each(['if (!x) run()', 'y = !x', 'y = !!x'])(
    'leaves the negation in %s to the constants of condition',
    line => {
      expect(runMutator('unary-operator', line)).toEqual([])
      expect(runMutator('condition', line)).toMatchObject([
        { replacement: 'true' },
        { replacement: 'false' },
      ])
    },
  )

  it.each<[string, string[]]>([
    [
      "declare let n: number; a = -1; b = +n; c = +'3'; d = ~~n; e = +x; g = +(2)",
      [
        '-1 -> 1 (owned negative-literal)',
        '+n -> n (equivalent numeric-plus)',
        "+'3' -> '3' (noise literal-coercion)",
        '+(2) -> (2) (equivalent number-literal-plus)',
      ],
    ],
  ])('lists the skipped mutants of %s', (source, expected) => {
    expect(listSkipped('unary-operator', source)).toStrictEqual(expected)
  })
})
