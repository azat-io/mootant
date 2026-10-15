import { describe, expect, it } from 'vitest'

import type { NodeSlot } from '../../../types/syntax/node-slot'

import { isNamePosition } from '../../../core/tree/is-name-position'
import { createTestFile } from '../../helpers/create-test-file'
import { walkTree } from '../../../core/tree/walk-tree'

/**
 * Finds the raw slot of the first identifier with a name, type positions and
 * skipped code included.
 *
 * @param source - Text of the snippet.
 * @param name - Identifier text to look for.
 * @returns Raw slot of the identifier.
 */
function getIdentifierSlot(source: string, name: string): NodeSlot {
  let { parsed, find } = createTestFile(source)
  let identifier = find('Identifier', name)
  let found: NodeSlot = { parent: null, index: null, key: null }
  walkTree(parsed.program, (node, slot) => {
    if (node === identifier) {
      found = slot
    }
    return true
  })
  return found
}

describe('isNamePosition', () => {
  it.each([
    { source: 'x = { a: 1 }', expected: true, name: 'a' },
    { source: 'x = { [a]: 1 }', expected: false, name: 'a' },
    { source: 'x = { b: a }', expected: false, name: 'a' },
    { source: 'class C { a = 1 }', expected: true, name: 'a' },
    { source: 'class C { [a] = 1 }', expected: false, name: 'a' },
    { source: 'class C { a() {} }', expected: true, name: 'a' },
    { source: 'class C { accessor a = 1 }', expected: true, name: 'a' },
    {
      source: 'abstract class C { abstract a: number }',
      expected: true,
      name: 'a',
    },
    {
      source: 'abstract class C { abstract [a]: number }',
      expected: false,
      name: 'a',
    },
    {
      source: 'abstract class C { abstract a(): void }',
      expected: true,
      name: 'a',
    },
    {
      source: 'abstract class C { abstract accessor a: number }',
      expected: true,
      name: 'a',
    },
    { source: 'x = b.a', expected: true, name: 'a' },
    { source: 'x = b[a]', expected: false, name: 'a' },
    { source: 'x = a.b', expected: false, name: 'a' },
    { source: 'x = import.meta', expected: true, name: 'meta' },
    { source: 'x = import.meta', expected: true, name: 'import' },
    { source: 'enum E { a }', expected: true, name: 'a' },
    { source: 'enum E { b = a }', expected: false, name: 'a' },
    { source: 'a: for (;;) break a', expected: true, name: 'a' },
    { source: 'export { a as b }', expected: false, name: 'b' },
    { expected: false, source: 'f(a)', name: 'a' },
  ])(
    'tells whether $name is a name in $source',
    ({ expected, source, name }) => {
      expect(isNamePosition(getIdentifierSlot(source, name))).toBe(expected)
    },
  )

  it('returns false for the empty slot of the program', () => {
    expect(isNamePosition({ parent: null, index: null, key: null })).toBe(false)
  })
})
