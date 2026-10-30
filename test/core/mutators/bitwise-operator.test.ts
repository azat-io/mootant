import { describe, expect, it } from 'vitest'

import { listSkipped } from '../../helpers/list-skipped'
import { runMutator } from '../../helpers/run-mutator'

describe('bitwiseOperator', () => {
  it.each<{
    expected: { replacement: string; original: string }[]
    source: string
  }>([
    {
      expected: [{ replacement: 'flags | mask', original: 'flags & mask' }],
      source: 'x = flags & mask',
    },
    {
      expected: [{ original: 'n | 0', replacement: 'n' }],
      source: 'x = n | 0',
    },
    {
      expected: [{ replacement: 'n >> 0', original: 'n >>> 0' }],
      source: 'x = n >>> 0',
    },
    {
      expected: [
        { replacement: 'a & (b & c)', original: 'a | b & c' },
        { replacement: '(b | c)', original: 'b & c' },
      ],
      source: 'x = a | b & c',
    },
    {
      expected: [
        { replacement: 'a | b & c', original: 'a ^ b & c' },
        { replacement: '(b | c)', original: 'b & c' },
      ],
      source: 'x = a ^ b & c',
    },
    {
      expected: [{ replacement: 'n >> 2', original: 'n << 2' }],
      source: 'x = n << 2',
    },
    {
      expected: [{ replacement: 'n << 2', original: 'n >> 2' }],
      source: 'x = n >> 2',
    },
    {
      expected: [{ replacement: 'n | m', original: 'n ^ m' }],
      source: 'x = n ^ m',
    },
    {
      expected: [{ replacement: 'n & 0n', original: 'n | 0n' }],
      source: 'x = n | 0n',
    },
    {
      expected: [{ original: '(n) | (0)', replacement: '(n)' }],
      source: 'x = (n) | (0)',
    },
    { source: 'x = n >> 0', expected: [] },
    { source: 'x = n << 0', expected: [] },
    { source: 'x = n << 0n', expected: [] },
    { source: 'x = 0 << n', expected: [] },
    { source: 'x = 0 >> n', expected: [] },
    { source: 'x = 0 >>> n', expected: [] },
    { source: 'x = (0) >>> n', expected: [] },
    {
      expected: [{ replacement: '0n >> n', original: '0n >>> n' }],
      source: 'x = 0n >>> n',
    },
    {
      expected: [{ replacement: '0n << n', original: '0n >> n' }],
      source: 'x = 0n >> n',
    },
    { source: 'x = n ^ 0', expected: [] },
    { source: 'x = 0 ^ n', expected: [] },
    { source: 'x = n ^ 0n', expected: [] },
    { source: 'x = n + m', expected: [] },
  ])('mutates $source', ({ expected, source }) => {
    expect(runMutator('bitwise-operator', source)).toMatchObject(expected)
  })

  it.each<{
    expected: { replacement: string; original: string }[]
    source: string
  }>([
    {
      expected: [{ replacement: '1', original: '0' }],
      source: 'x = n | 0',
    },
    {
      expected: [{ replacement: '1', original: '0' }],
      source: 'x = n >> 0',
    },
  ])(
    'lets number-literal change the literal of $source',
    ({ expected, source }) => {
      expect(runMutator('number-literal', source)).toMatchObject(expected)
    },
  )

  it.each<[string, string[]]>([
    [
      'declare let n: number; a = n ^ 0; b = 0 >> n; c = n << 0; d = 0 ^ n; e = n | 0',
      [
        'n ^ 0 -> n | 0 (equivalent identity-operand)',
        '0 >> n -> 0 << n (equivalent identity-operand)',
        'n << 0 -> n >> 0 (equivalent identity-operand)',
        '0 ^ n -> 0 | n (equivalent identity-operand)',
      ],
    ],
  ])('lists the skipped mutants of %s', (source, expected) => {
    expect(listSkipped('bitwise-operator', source)).toStrictEqual(expected)
  })
})
