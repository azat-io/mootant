import { describe, expect, it } from 'vitest'

import { isReadChain } from '../../../core/syntax/is-read-chain'
import { createTestFile } from '../../helpers/create-test-file'

/**
 * Checks the value assigned to `x` in a snippet.
 *
 * @param source - Value of `x`.
 * @returns Whether the value is a plain read.
 */
function check(source: string): boolean {
  let { find } = createTestFile(`x = ${source}`)
  return isReadChain(find('AssignmentExpression').right)
}

describe('isReadChain', () => {
  it.each([
    'a',
    'this',
    'a.b',
    'a?.b',
    'this.x.y',
    'a[0]',
    "a['k']",
    'a[key]',
    'a[b.c]',
    'a?.[0]?.b',
    '(a as T)!.b',
    'a.#b',
  ])('accepts %s', source => {
    expect(check(source)).toBe(true)
  })

  it.each([
    'f()',
    'a.b()',
    'a?.b()',
    'a[f()]',
    'a[i + 1]',
    'a[1n]',
    'a[/x/]',
    'a[true]',
    'tag`a`',
    'f().a',
    '1',
    'import.meta.url',
  ])('rejects %s', source => {
    expect(check(source)).toBe(false)
  })

  it('rejects super', () => {
    let { find } = createTestFile(
      'class A extends B { m() { return super.x } }',
    )

    expect(isReadChain(find('MemberExpression', 'super.x'))).toBe(false)
  })
})
