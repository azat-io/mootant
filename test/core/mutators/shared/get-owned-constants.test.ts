import type { Node } from 'oxc-parser'

import { describe, expect, it } from 'vitest'

import { getOwnedConstants } from '../../../../core/mutators/shared/get-owned-constants'
import { createTestContext } from '../../../helpers/create-test-context'

describe('getOwnedConstants', () => {
  it.each<{
    expected: [boolean, string][]
    type: Node['type']
    source: string
    text: string
  }>([
    {
      expected: [
        [true, 'logical-operator'],
        [false, 'logical-operator'],
      ],
      source: 'if (a < b && c) {}',
      type: 'BinaryExpression',
      text: 'a < b',
    },
    {
      expected: [[true, 'logical-operator']],
      source: 'k = [!x && y]',
      type: 'UnaryExpression',
      text: '!x',
    },
    {
      expected: [[false, 'logical-operator']],
      source: 'k = [!x || y]',
      type: 'UnaryExpression',
      text: '!x',
    },
    {
      source: 'k = [y && !x]',
      type: 'UnaryExpression',
      expected: [],
      text: '!x',
    },
    {
      type: 'UnaryExpression',
      source: 'k = [!x]',
      expected: [],
      text: '!x',
    },
  ])(
    'finds the owned constants of $source',
    ({ expected, source, type, text }) => {
      let { context, find } = createTestContext(source)
      let owned = getOwnedConstants(find(type, text), context)

      expect(
        [true, false].flatMap(value => {
          let note = owned.get(value)
          return note ? [[value, note.by?.mutator]] : []
        }),
      ).toEqual(expected)
      expect([...owned.values()].every(note => note.rule === 'O3')).toBe(true)
    },
  )
})
