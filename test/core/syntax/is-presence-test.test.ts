import { describe, expect, it } from 'vitest'

import { isPresenceTest } from '../../../core/syntax/is-presence-test'
import { createTestFile } from '../../helpers/create-test-file'

/**
 * Asks about the call `s.match(a)` of a snippet.
 *
 * @param source - Snippet with such a call.
 * @returns Whether only the presence of the call's value is used.
 */
function check(source: string): boolean {
  let { find, tree } = createTestFile(source)
  return isPresenceTest(tree, find('CallExpression', 's.match(a)'))
}

describe('isPresenceTest', () => {
  it.each([
    'if (s.match(a)) go()',
    'x = s.match(a) ? 1 : 2',
    'x = !s.match(a)',
    'while (s.match(a)) go()',
    'for (; s.match(a); ) go()',
    'do go(); while (s.match(a))',
    'if (b && s.match(a)) go()',
    'if (s.match(a) || b) go()',
    'if ((s.match(a) as string[])) go()',
    'x = s.match(a) === null',
    'x = s.match(a) !== null',
    'x = s.match(a) == null',
    'x = s.match(a) != null',
    'x = null === s.match(a)',
    'x = (null as unknown) === s.match(a)',
    'x = s.match(a) && 1',
    'x = (s.match(a)) && 1',
    'x = s.match(a)! && 1',
  ])('accepts %s', source => {
    expect(check(source)).toBe(true)
  })

  it.each([
    'x = s.match(a)',
    'x = b && s.match(a)',
    'x = s.match(a) || b',
    'x = s.match(a) ?? b',
    'x = b ? s.match(a) : c',
    'function f(s) { return s.match(a) }',
    'x = s.match(a)[0]',
    'x = s.match(a) === undefined',
    'x = s.match(a) === b',
    'x = s.match(a) + null',
    'x = s.match(a) < null',
    'x = s.match(a) === 0',
    'x = s.match(a) === /(/',
    '[s.match(a)]',
    'x = typeof s.match(a)',
  ])('rejects %s', source => {
    expect(check(source)).toBe(false)
  })

  it.each([
    ['if (s?.match(a)) go()', true],
    ['x = !s?.match(a)', true],
    ['x = s?.match(a) === null', true],
    ['x = s?.match(a) && 1', true],
    ['x = s?.match(a)', false],
  ])(
    'looks through the optional chain the call ends in %s',
    (source, expected) => {
      let { find, tree } = createTestFile(source)

      expect(isPresenceTest(tree, find('CallExpression', 's?.match(a)'))).toBe(
        expected,
      )
    },
  )

  it('does not take a call inside a chain for its end', () => {
    let { find, tree } = createTestFile('if (s.match(a)?.[0]) go()')

    expect(isPresenceTest(tree, find('CallExpression', 's.match(a)'))).toBe(
      false,
    )
  })

  it('rejects the program', () => {
    let { find, tree } = createTestFile('a')

    expect(isPresenceTest(tree, find('Program'))).toBe(false)
  })
})
