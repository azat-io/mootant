import { describe, expect, it } from 'vitest'

import { isWrittenMember } from '../../../core/syntax/is-written-member'
import { createTestFile } from '../../helpers/create-test-file'

/**
 * Asks about the member `a[0]` of a snippet.
 *
 * @param source - Snippet with such a member.
 * @param text - Text of the member; `a[0]` when omitted.
 * @returns Whether code writes or deletes the member.
 */
function check(source: string, text = 'a[0]'): boolean {
  let { find, tree } = createTestFile(source)
  return isWrittenMember(tree, find('MemberExpression', text))
}

describe('isWrittenMember', () => {
  it.each([
    'a[0] = 1',
    'a[0] += 1',
    'a[0] ||= 1',
    'a[0]++',
    '--a[0]',
    '(a[0]) = 1',
    '(a[0] as any) = 1',
    'a[0]! = 1',
    '[a[0]] = b',
    '[a[0] = 1] = b',
    '[...a[0]] = b',
    '({ c: a[0] } = b)',
    'for (a[0] of b) go()',
    'for (a[0] in b) go()',
    'delete a[0]',
    'delete (a[0])',
    'x = delete (a[0] as any)',
  ])('accepts %s', source => {
    expect(check(source)).toBe(true)
  })

  it('looks through the optional chain the member ends', () => {
    expect(check('delete a?.[0]', 'a?.[0]')).toBe(true)
  })

  it.each([
    'x = a[0]',
    'a[0]',
    'f(a[0])',
    'a[0]()',
    'a[0].b = 1',
    'delete a[0].b',
    'b[a[0]] = 1',
    'typeof a[0]',
    'void a[0]',
    'x = a[0] || b',
    'x = [a[0]]',
    'x = { c: a[0] }',
  ])('rejects %s', source => {
    expect(check(source)).toBe(false)
  })

  it('does not take the end of a chain for a write of a member inside it', () => {
    expect(check('x = a?.[0]', 'a?.[0]')).toBe(false)
  })
})
