import { describe, expect, it } from 'vitest'

import { getChainRoot } from '../../../core/syntax/get-chain-root'
import { createTestFile } from '../../helpers/create-test-file'

describe('getChainRoot', () => {
  it.each([
    { type: 'ChainExpression', source: 'a?.b', chain: 'a?.b', text: 'a?.b' },
    { type: 'Identifier', source: 'a?.b.c', chain: 'a?.b.c', text: 'a' },
    {
      type: 'MemberExpression',
      source: 'a?.b.c',
      chain: 'a?.b.c',
      text: 'a?.b',
    },
    {
      type: 'MemberExpression',
      source: 'a?.b!.c',
      chain: 'a?.b!.c',
      text: 'a?.b',
    },
    {
      type: 'CallExpression',
      source: 'a?.b().c',
      chain: 'a?.b().c',
      text: 'a?.b()',
    },
    {
      type: 'MemberExpression',
      source: 'a.b?.()',
      chain: 'a.b?.()',
      text: 'a.b',
    },
    {
      type: 'MemberExpression',
      source: '(a?.b).c',
      chain: 'a?.b',
      text: 'a?.b',
    },
  ] as const)(
    'finds $chain for $text in $source',
    ({ source, chain, type, text }) => {
      let { find, tree } = createTestFile(source)

      expect(getChainRoot(tree, find(type, text))).toBe(
        find('ChainExpression', chain),
      )
    },
  )

  it.each([
    { type: 'Identifier', source: 'a.b.c', text: 'a' },
    { type: 'MemberExpression', source: '(a?.b).c', text: '(a?.b).c' },
    { type: 'Identifier', source: 'a?.(b)', text: 'b' },
    { type: 'Identifier', source: 'a?.[b]', text: 'b' },
    { type: 'Program', source: 'a', text: 'a' },
  ] as const)('returns null for $text in $source', ({ source, type, text }) => {
    let { find, tree } = createTestFile(source)

    expect(getChainRoot(tree, find(type, text))).toBeNull()
  })

  it('throws for a node outside the runtime tree', () => {
    let { tree } = createTestFile('a?.b')
    let other = createTestFile('a?.b')

    expect(() => getChainRoot(tree, other.find('ChainExpression'))).toThrow(
      'Node is not part of the runtime tree of the file.',
    )
  })
})
