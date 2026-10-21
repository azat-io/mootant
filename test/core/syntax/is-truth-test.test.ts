import { describe, expect, it } from 'vitest'

import { isTruthTest } from '../../../core/syntax/is-truth-test'
import { createTestFile } from '../../helpers/create-test-file'

describe('isTruthTest', () => {
  it.each([
    'if (a) {}',
    'while ((a as boolean)) {}',
    'do {} while (a)',
    'for (; a;) {}',
    'x = a ? b : c',
    'if (b ? a : c) {}',
    'if (b ? c : (a)) {}',
    'x = !a',
    'if (a && b) {}',
    'x = !(b || a)',
    'if (b ?? a) {}',
    'if ((b, a)) {}',
  ])('accepts a in %s', source => {
    let { find, tree } = createTestFile(source)

    expect(isTruthTest(tree, find('Identifier', 'a'))).toBe(true)
  })

  it.each([
    'x = b ? a : c',
    'x = -a',
    'x = a && b',
    'if (a ?? b) {}',
    'if ((a, b)) {}',
    'x = typeof a',
    'x = Boolean(a)',
    'items.filter(item => a)',
    'items.every(item => { return a })',
    'function f() { return a }',
    'for (a; b;) {}',
    'x = a',
  ])('rejects a in %s', source => {
    let { find, tree } = createTestFile(source)

    expect(isTruthTest(tree, find('Identifier', 'a'))).toBe(false)
  })

  it('rejects the program', () => {
    let { find, tree } = createTestFile('if (a) {}')

    expect(isTruthTest(tree, find('Program'))).toBe(false)
  })

  it('throws for a node outside the runtime tree', () => {
    let { tree } = createTestFile('if (a) {}')
    let other = createTestFile('if (a) {}')

    expect(() => isTruthTest(tree, other.find('Identifier', 'a'))).toThrow(
      'Node is not part of the runtime tree of the file.',
    )
  })
})
