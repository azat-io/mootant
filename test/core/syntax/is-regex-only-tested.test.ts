import { describe, expect, it } from 'vitest'

import { isRegexOnlyTested } from '../../../core/syntax/is-regex-only-tested'
import { createTestProgram } from '../../helpers/create-test-program'
import { createTestFile } from '../../helpers/create-test-file'

/**
 * Asks about the regular expression literal of a snippet.
 *
 * @param source - Snippet with one regular expression literal.
 * @param component - Whether the snippet is the script of a component, whose
 *   top level other code shares; false when omitted.
 * @returns Whether code only asks the regular expression whether it matches.
 */
function check(source: string, component = false): boolean {
  let file = createTestFile(source)
  let literal = file.find('Literal')
  let { flags } = (literal as { regex: { flags: string } } & typeof literal)
    .regex
  return isRegexOnlyTested(createTestProgram(file, component), literal, flags)
}

describe('isRegexOnlyTested', () => {
  it.each([
    'x = /a/.test(s)',
    'x = (/a/).test(s)',
    'x = (/a/ as RegExp).test(s)',
    'x = /a/!.test(s)',
    'x = /a/?.test(s)',
    'x = /a/.test?.(s)',
    '/a/.test(s)',
    'x = /a/g.test(s)',
    'x = /a/im.test(s)',
    'x = /a/.exec(s) ? 1 : 2',
    'if (/a/.exec(s)) go()',
    'x = !/a/.exec(s)',
    'x = /a/.exec(s) === null',
    'x = /a/.exec(s) && 1',
    'x = /a/g.exec(s) !== null',
  ])('accepts the literal of %s', source => {
    expect(check(source)).toBe(true)
  })

  it.each([
    'const re = /a/; x = re.test(s)',
    'let re = /a/; x = re.test(s); y = re.test(t)',
    'const re = /a/ as RegExp; x = (re as RegExp).test(s)',
    'const re = /a/; if (re.exec(s)) go()',
    'const re = /a/; x = re.test(s) || re.exec(t) === null',
    'function f(s) { const re = /a/; return re.test(s) }',
  ])('accepts the name of %s', source => {
    expect(check(source)).toBe(true)
  })

  it.each([
    'x = /a/',
    'x = /a/y.test(s)',
    'x = /a/gy.test(s)',
    'x = /a/.exec(s)',
    'x = /a/.exec(s)?.[0]',
    'x = /a/.exec(s)[0]',
    'x = /a/.exec(s) || b',
    'x = s.match(/a/)',
    'if (s.match(/a/)) go()',
    'x = s.search(/a/)',
    'x = /a/.source',
    'x = /a/.lastIndex',
    'x = /a/.test',
    'x = /a/.test.call(/a/, s)',
    'x = /a/["test"](s)',
    'x = /a/[test](s)',
    'x = /a/.compile()',
    'new /a/.test(s)',
    'f(/a/)',
    '[/a/]',
    'x = /a/ || b',
  ])('rejects the literal of %s', source => {
    expect(check(source)).toBe(false)
  })

  it.each([
    'const re = /a/',
    'let re = /a/; re = /b/; x = re.test(s)',
    'var re = /a/; x = re.test(s)',
    'const re = /a/; x = re.test(s); y = re.exec(s)',
    'const re = /a/; x = re.test(s); y = re',
    'const re = /a/; x = re.test(s); f(re)',
    'const re = /a/; x = re.test(s); y = re.lastIndex',
    'const re = /a/; x = re.test(s); y = s.match(re) ? 1 : 2',
    'export const re = /a/; x = re.test(s)',
    'const re = /a/; x = re.test(s); export { re }',
    'const re = /a/g; x = re.test(s)',
    'const re = /a/y; x = re.test(s)',
    'const { re } = { re: /a/ }; x = re.test(s)',
    'const list = [/a/]; x = list[0].test(s)',
    'eval(code); const re = /a/; x = re.test(s)',
  ])('rejects the name of %s', source => {
    expect(check(source)).toBe(false)
  })

  it('rejects a name that the other scripts of a component may read', () => {
    expect(check('const re = /a/; x = re.test(s)', true)).toBe(false)
  })

  it('asks about a call of RegExp', () => {
    let file = createTestFile("x = new RegExp('a').test(s)")

    expect(
      isRegexOnlyTested(
        createTestProgram(file),
        file.find('NewExpression'),
        '',
      ),
    ).toBe(true)
  })
})
