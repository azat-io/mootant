import { describe, expect, it } from 'vitest'

import type { MutatorSetup } from '../../helpers/generate-mutants'

import { listSkipped } from '../../helpers/list-skipped'
import { runMutator } from '../../helpers/run-mutator'

describe('updateOperator', () => {
  it.each<{
    expected: { replacement: string; original: string }[]
    source: string
  }>([
    {
      expected: [{ replacement: 'count--', original: 'count++' }],
      source: 'count++',
    },
    {
      expected: [
        { replacement: 'count--', original: 'count++' },
        { replacement: '++count', original: 'count++' },
      ],
      source: 'values[count++] = n',
    },
    {
      source: 'for (let i = 0; i < n; i++) use(i)',
      expected: [],
    },
    {
      source: 'for (let i = 0, j = n - 1; i < j; i++, j--) use(i, j)',
      expected: [],
    },
    {
      expected: [{ replacement: '--i', original: 'i--' }],
      source: 'while (i--) use(i)',
    },
    {
      expected: [
        { replacement: '--b', original: '++b' },
        { replacement: 'b++', original: '++b' },
      ],
      source: 'x = a-++b',
    },
    {
      expected: [{ replacement: 'i--', original: 'i++' }],
      source: 'void i++',
    },
    {
      expected: [{ replacement: 'i--', original: 'i++' }],
      source: 'x = (i++, j)',
    },
    {
      expected: [
        { replacement: 'i--', original: 'i++' },
        { replacement: '++i', original: 'i++' },
      ],
      source: 'x = (j, i++)',
    },
    {
      expected: [{ replacement: 'i--', original: 'i++' }],
      source: '(j, i++)',
    },
    {
      expected: [
        { replacement: '++ /* c */ k', original: '-- /* c */ k' },
        { replacement: '/* c */ k--', original: '-- /* c */ k' },
      ],
      source: 'x = -- /* c */ k',
    },
    {
      expected: [
        { replacement: 'k /* c */ --', original: 'k /* c */ ++' },
        { replacement: '++k /* c */', original: 'k /* c */ ++' },
      ],
      source: 'x = k /* c */ ++',
    },
  ])('mutates $source', ({ expected, source }) => {
    expect(runMutator('update-operator', source)).toMatchObject(expected)
  })

  it.each<{ setup: MutatorSetup }>([
    { setup: { settings: { timeouts: true } } },
    { setup: { preset: 'strict' } },
  ])('swaps an update that advances a loop with $setup', ({ setup }) => {
    let source = 'while (i--) use(i)'

    expect(runMutator('update-operator', source, setup)).toMatchObject([
      { replacement: 'i++', original: 'i--' },
      { replacement: '--i', original: 'i--' },
    ])
  })

  it.each<{ setup: MutatorSetup; source: string }>([
    {
      source: ['// mootant-ignore-next-line update-operator', 'count++'].join(
        '\n',
      ),
      setup: {},
    },
    {
      setup: { mutators: { 'update-operator': 'off' } },
      source: 'count++',
    },
  ])(
    'brings back the statement removal without the swap in $source',
    ({ source, setup }) => {
      expect(runMutator('statement-removal', 'count++')).toEqual([])
      expect(runMutator('statement-removal', source, setup)).toMatchObject([
        { original: 'count++', replacement: ';' },
      ])
    },
  )

  it.each([
    [
      'outer: for (const item of items) {',
      '  while (true) {',
      '    if (i > 10) break outer',
      '    i++',
      '  }',
      '}',
    ],
    [
      'function f() {',
      '  while (true) {',
      '    i++',
      '    while (true) { if (i > 10) return i; break }',
      '  }',
      '}',
    ],
  ])(
    'keeps an update read by a jump that leaves several loops in %j',
    (...lines) => {
      let source = lines.join('\n')

      expect(runMutator('update-operator', source)).toStrictEqual([])
      expect(
        runMutator('update-operator', source, { settings: { timeouts: true } }),
      ).toMatchObject([{ replacement: 'i--', original: 'i++' }])
    },
  )

  it.each<[string, string[]]>([
    [
      'declare let n: number; for (let i = 0; i < n; i++) {} n++; a = n++',
      [
        'i++ -> i-- (timeout loop-advance)',
        'i++ -> ++i (equivalent unused-result)',
        'n++ -> ++n (equivalent unused-result)',
      ],
    ],
  ])('lists the skipped mutants of %s', (source, expected) => {
    expect(listSkipped('update-operator', source)).toStrictEqual(expected)
  })
})
