import { describe, expect, it } from 'vitest'

import { getResultSlot } from '../../../core/syntax/get-result-slot'
import { createTestFile } from '../../helpers/create-test-file'

describe('getResultSlot', () => {
  it.each([
    {
      parent: 'AssignmentExpression',
      source: 'x = (a as T)',
      key: 'right',
      index: null,
    },
    {
      parent: 'AssignmentExpression',
      source: 'x = (b, (c, a))',
      key: 'right',
      index: null,
    },
    {
      parent: 'ArrowFunctionExpression',
      source: 'f(() => (b, a))',
      key: 'body',
      index: null,
    },
    {
      parent: 'ExpressionStatement',
      key: 'expression',
      source: 'b, a',
      index: null,
    },
    {
      parent: 'SequenceExpression',
      source: 'x = (a, b)',
      key: 'expressions',
      index: 0,
    },
    {
      parent: 'SequenceExpression',
      source: 'x = ((b, a), c)',
      key: 'expressions',
      index: 0,
    },
  ])(
    'finds the slot that takes the value of a in $source',
    ({ source, parent, index, key }) => {
      let { tree, find } = createTestFile(source)

      let slot = getResultSlot(tree, find('Identifier', 'a'))

      expect(slot).toMatchObject({ parent: { type: parent }, index, key })
    },
  )

  it('returns an empty slot for the program', () => {
    let { tree, find } = createTestFile('a')

    expect(getResultSlot(tree, find('Program'))).toStrictEqual({
      parent: null,
      index: null,
      key: null,
    })
  })
})
