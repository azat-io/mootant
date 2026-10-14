import { describe, expect, it } from 'vitest'

import { isConditionTest } from '../../../core/syntax/is-condition-test'
import { createTestFile } from '../../helpers/create-test-file'

describe('isConditionTest', () => {
  it.each([
    { source: 'if (a) {}', expected: true },
    { source: 'if ((a as boolean)) {}', expected: true },
    { source: 'x = a ? b : c', expected: true },
    { source: 'x = (a!) ? b : c', expected: true },
    { source: 'x = b ? a : c', expected: false },
    { source: 'while (a) {}', expected: false },
    { expected: false, source: 'f(a)' },
  ])(
    'tells whether a is a condition test in $source',
    ({ expected, source }) => {
      let { find, tree } = createTestFile(source)

      expect(isConditionTest(tree, find('Identifier', 'a'))).toBe(expected)
    },
  )

  it('returns false for the program', () => {
    let { find, tree } = createTestFile('a')

    expect(isConditionTest(tree, find('Program'))).toBe(false)
  })

  it('throws for a node outside the runtime tree', () => {
    let { tree } = createTestFile('if (a) {}')
    let other = createTestFile('if (a) {}')

    expect(() => isConditionTest(tree, other.find('Identifier', 'a'))).toThrow(
      'Node is not part of the runtime tree of the file.',
    )
  })
})
