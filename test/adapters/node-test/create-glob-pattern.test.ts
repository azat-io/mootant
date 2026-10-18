import { describe, expect, it } from 'vitest'

import { createGlobPattern } from '../../../adapters/node-test/create-glob-pattern'

/**
 * Tells which paths a glob matches.
 *
 * @param glob - Glob to compile.
 * @param paths - Relative paths.
 * @returns Paths it matches.
 */
function match(glob: string, paths: string[]): string[] {
  let pattern = createGlobPattern(glob)
  return paths.filter(file => pattern.test(file))
}

describe('createGlobPattern', () => {
  it('matches directories with ** and names with * and ?', () => {
    expect(
      match('**/*.test.js', [
        'a.test.js',
        'x/y/b.test.js',
        'c.test.ts',
        'x/.js',
      ]),
    ).toStrictEqual(['a.test.js', 'x/y/b.test.js'])
    expect(
      match('test/**', ['test/a.js', 'test/x/b.js', 'tests/a.js']),
    ).toStrictEqual(['test/a.js', 'test/x/b.js'])
    expect(match('a**b.js', ['ab.js', 'a12b.js', 'a/b.js'])).toStrictEqual([
      'ab.js',
      'a12b.js',
    ])
    expect(match('?.js', ['a.js', 'ab.js'])).toStrictEqual(['a.js'])
  })

  it('matches braces and character classes', () => {
    expect(
      match('*.{test,spec}.{js,ts}', ['a.test.ts', 'b.spec.js', 'c.unit.js']),
    ).toStrictEqual(['a.test.ts', 'b.spec.js'])
    expect(match('[ab].js', ['a.js', 'c.js'])).toStrictEqual(['a.js'])
    expect(match('[!ab].js', ['a.js', 'c.js'])).toStrictEqual(['c.js'])
    expect(match(String.raw`[\].js`, [String.raw`\.js`, 'a.js'])).toStrictEqual(
      [String.raw`\.js`],
    )
  })

  it('matches unclosed brackets, braces and other characters as text', () => {
    expect(match('a[.js', ['a[.js'])).toStrictEqual(['a[.js'])
    expect(match('a{b,c.js', ['a{b,c.js'])).toStrictEqual(['a{b,c.js'])
    expect(match('a}b(c)+$.js', ['a}b(c)+$.js', 'a}bc.js'])).toStrictEqual([
      'a}b(c)+$.js',
    ])
  })
})
