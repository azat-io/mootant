import { describe, expect, it } from 'vitest'

import { getMatchResultUse } from '../../../core/syntax/get-match-result-use'
import { createTestProgram } from '../../helpers/create-test-program'
import { createTestFile } from '../../helpers/create-test-file'

/**
 * Asks about the only call of a method named `match` in a snippet.
 *
 * @param source - Snippet with such a call on `s`.
 * @param component - Whether the snippet is the script of a component, whose
 *   top level other code shares; false when omitted.
 * @returns What the code reads of the result of the call.
 */
function check(source: string, component = false): 'length' | 'first' | null {
  let file = createTestFile(source)
  let text = source.includes('s?.match') ? 's?.match(a)' : 's.match(a)'
  return getMatchResultUse(
    createTestProgram(file, component),
    file.find('CallExpression', text),
  )
}

describe('getMatchResultUse', () => {
  it('stops at the whole result, which a test can tell apart', () => {
    expect('ab'.match(/^a/u)).not.toStrictEqual('ab'.match(/^a/gu))
    expect('ab'.match(/^a/u)).not.toEqual('ab'.match(/^a/gu))
    expect(check('x = s.match(a)')).toBeNull()
  })

  it.each([
    'x = s.match(a)[0]',
    'x = s.match(a)?.[0]',
    'x = s.match(a)![0]',
    'x = (s.match(a) as string[])[0]',
    'x = (s.match(a) || [])[0]',
    'x = (s.match(a) ?? [])[0]',
    'x = (s.match(a) ?? [])[0]?.length',
    'x = (b && s.match(a) || [])[0]',
    'x = s?.match(a)?.[0]',
    'x = s.match(a)[0].length',
    's.match(a)[0].b = c',
    'let [y] = s.match(a)',
    'let [y] = s.match(a) ?? []',
    'let [y = 1] = s.match(a) ?? []',
    'let [,] = s.match(a) ?? []',
    'if (s.match(a)) go()',
    'if (s?.match(a)) go()',
    'x = s.match(a) === null',
    'x = s.match(a) && 1',
    'if (s.match(a) || b) go()',
    'if (s.match(a) ?? b) go()',
    'x = (s.match(a) || []) !== null',
  ])('reads the first match in %s', source => {
    expect(check(source)).toBe('first')
  })

  it.each([
    'let m = s.match(a); x = m[0]',
    'let m = s.match(a); x = m?.[0]',
    'const m = s.match(a); if (m) go(m[0])',
    'const m = s.match(a); if (!m) go(); x = m === null',
    'const m = s.match(a); x = m && m[0]',
    'let m = s.match(a) ?? []; x = m[0]',
    'let m = s.match(a) as string[]; x = (m as string[])[0]',
    'let m = s?.match(a); x = m?.[0]',
    'let m = s.match(a); let [y] = m',
    'function f(s) { let m = s.match(a); return m ? m[0] : null }',
  ])('reads the first match through the name in %s', source => {
    expect(check(source)).toBe('first')
  })

  it.each([
    'x = s.match(a).length',
    'x = s.match(a)?.length',
    'x = s.match(a)!.length',
    'x = (s.match(a) || []).length',
    'x = (s.match(a) ?? []).length',
    'x = s?.match(a)?.length',
    'let m = s.match(a); x = m.length',
    'let m = s.match(a); x = m?.length; y = m?.[0]; if (m) go()',
    'let m = s.match(a) || []; x = m.length',
  ])('reads the length in %s', source => {
    expect(check(source)).toBe('length')
  })

  it.each([
    's.match(a)',
    'x = s.match(a)',
    'x = s?.match(a)',
    'x = b || s.match(a)',
    'function f(s) { return s.match(a) }',
    'f(s.match(a))',
    '[s.match(a)]',
    'x = s.match(a)[1]',
    'x = s.match(a)[i]',
    'x = s.match(a)["0"]',
    'x = s.match(a)["length"]',
    'x = s.match(a)[length]',
    's.match(a)[0] = b',
    'delete s.match(a)[0]',
    's.match(a).length = 0',
    '(s.match(a) || [])[0] = b',
    'x = s.match(a).index',
    'x = s.match(a)?.input',
    'x = s.match(a)?.groups',
    'x = s.match(a).map(f)',
    'x = s.match(a).join()',
    'x = b ? s.match(a) : []',
    'x = [...s.match(a)]',
    'for (let y of s.match(a)) go()',
    'y = s.match(a)',
    'let [y, z] = s.match(a)',
    'let [...y] = s.match(a)',
    'let [] = s.match(a)',
    'let { index } = s.match(a)',
    'let { 0: y } = s.match(a)',
    'x = { [s.match(a)]: 1 }',
  ])('sees no such read in %s', source => {
    expect(check(source)).toBeNull()
  })

  it.each([
    'let m = s.match(a)',
    'let m = s.match(a); x = m',
    'let m = s.match(a); f(m)',
    'let m = s.match(a); x = m[1]',
    'let m = s.match(a); x = m.index',
    'let m = s.match(a); x = m[0]; y = m',
    'let m = s.match(a); m = b; x = m[0]',
    'var m = s.match(a); x = m[0]',
    'export const m = s.match(a); x = m[0]',
    'const m = s.match(a); x = m[0]; export { m }',
    'let { m } = s.match(a)',
    'let m = s.match(a); m[0] = f; x = m[0]()',
    'let m = s.match(a); m[0] += b; x = m[0]',
    'let m = s.match(a); m[0]++; x = m[0]',
    'let m = s.match(a); delete m[0]; x = m[0]',
    'let m = s.match(a); [m[0]] = b; x = m[0]',
    'let m = s.match(a); for (m[0] of b) go(m[0])',
    'let m = s.match(a); m.length = 0; x = m.length',
    'let m = s.match(a); m.length++; x = m[0]',
    'let m = s.match(a); delete m.length; x = m[0]',
    'let m = b ? s.match(a) : c; x = m[0]',
    'eval(code); let m = s.match(a); x = m[0]',
  ])('sees no such read through the name in %s', source => {
    expect(check(source)).toBeNull()
  })

  it('reads nothing through a name that the other scripts of a component may read', () => {
    expect(check('let m = s.match(a); x = m[0]', true)).toBeNull()
  })
})
