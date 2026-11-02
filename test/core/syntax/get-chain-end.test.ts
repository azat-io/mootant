import { describe, expect, it } from 'vitest'

import { getChainEnd } from '../../../core/syntax/get-chain-end'
import { createTestFile } from '../../helpers/create-test-file'

describe('getChainEnd', () => {
  it.each(['x = a?.b', 'x = (a?.b)!', 'x = a?.b!'])(
    'finds the chain that a.b ends in %s',
    source => {
      let { find, tree } = createTestFile(source)

      expect(getChainEnd(tree, find('MemberExpression'))).toBe(
        find('ChainExpression'),
      )
    },
  )

  it.each(['x = a.b', 'x = a?.b.c', 'f(a.b)'])(
    'keeps the node that ends no chain in %s',
    source => {
      let { find, tree } = createTestFile(source)
      let member = find(
        'MemberExpression',
        source.includes('c') ? 'a?.b' : 'a.b',
      )

      expect(getChainEnd(tree, member)).toBe(member)
    },
  )
})
