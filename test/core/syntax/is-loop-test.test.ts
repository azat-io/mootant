import { describe, expect, it } from 'vitest'

import { createTestFile } from '../../helpers/create-test-file'
import { isLoopTest } from '../../../core/syntax/is-loop-test'

describe('isLoopTest', () => {
  it.each([
    { source: 'for (; a;) {}', expected: true },
    { source: 'while (a) {}', expected: true },
    { source: 'while ((a as boolean)) {}', expected: true },
    { source: 'do {} while (a)', expected: true },
    { source: 'for (a; ;) {}', expected: false },
    { source: 'for (;; a) {}', expected: false },
    { source: 'if (a) {}', expected: false },
    { expected: false, source: 'f(a)' },
  ])('tells whether a is a loop test in $source', ({ expected, source }) => {
    let { find, tree } = createTestFile(source)

    expect(isLoopTest(tree, find('Identifier', 'a'))).toBe(expected)
  })

  it('returns false for the program', () => {
    let { find, tree } = createTestFile('a')

    expect(isLoopTest(tree, find('Program'))).toBe(false)
  })

  it('throws for a node outside the runtime tree', () => {
    let { tree } = createTestFile('while (a) {}')
    let other = createTestFile('while (a) {}')

    expect(() => isLoopTest(tree, other.find('Identifier', 'a'))).toThrow(
      'Node is not part of the runtime tree of the file.',
    )
  })
})
