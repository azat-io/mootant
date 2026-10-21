import { describe, expect, it } from 'vitest'

import { passesTruthiness } from '../../../core/syntax/passes-truthiness'
import { getContextSlot } from '../../../core/tree/get-context-slot'
import { createTestFile } from '../../helpers/create-test-file'

/**
 * Tells whether the truthiness question about `a` in a snippet moves on to its
 * parent.
 *
 * @param source - Snippet with the name `a`.
 * @returns Whether the slot of `a` passes the question on.
 */
function passes(source: string): boolean {
  let { find, tree } = createTestFile(source)
  return passesTruthiness(getContextSlot(tree, find('Identifier', 'a')))
}

describe('passesTruthiness', () => {
  it.each([
    'x = a && b',
    'x = b || (a)',
    'x = b ?? a',
    'x = b ? a : c',
    'x = b ? c : a',
    'x = (b, a)',
  ])('passes the question on from a in %s', source => {
    expect(passes(source)).toBe(true)
  })

  it.each([
    'x = a ?? b',
    'x = a ? b : c',
    'x = (a, b)',
    'x = !a',
    'if (a) {}',
    'x = a',
  ])('keeps the question at a in %s', source => {
    expect(passes(source)).toBe(false)
  })

  it('keeps the question at the program', () => {
    let { find, tree } = createTestFile('x = a')

    expect(passesTruthiness(getContextSlot(tree, find('Program')))).toBe(false)
  })
})
