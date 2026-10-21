import { describe, expect, it } from 'vitest'

import { getContextSlot } from '../../../core/tree/get-context-slot'
import { isWriteTarget } from '../../../core/syntax/is-write-target'
import { createTestFile } from '../../helpers/create-test-file'

/**
 * Tells whether the member `a.b` of a snippet is assigned to.
 *
 * @param source - Snippet with the member `a.b`.
 * @returns Whether the member is a write target.
 */
function check(source: string): boolean {
  let { find, tree } = createTestFile(source)
  return isWriteTarget(
    tree,
    getContextSlot(tree, find('MemberExpression', 'a.b')),
  )
}

describe('isWriteTarget', () => {
  it.each([
    'a.b = 1',
    'a.b += 1',
    '(a.b as number) = 1',
    'a.b++',
    '--a.b',
    '[a.b] = list',
    '[...a.b] = list',
    '({ key: a.b } = o)',
    '({ key: a.b = 1 } = o)',
    'for (a.b of list) {}',
    'for (a.b in o) {}',
  ])('finds a write in %s', source => {
    expect(check(source)).toBe(true)
  })

  it.each([
    'x = a.b',
    'x = a.b + 1',
    'x = { key: a.b }',
    'x = [a.b]',
    'a.b()',
    'delete a.b',
    'for (const x of a.b) {}',
    'x = (o.c = a.b)',
  ])('finds no write in %s', source => {
    expect(check(source)).toBe(false)
  })
})
