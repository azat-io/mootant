import { describe, expect, it } from 'vitest'

import { findStringMatchCall } from '../../../core/regex/find-string-match-call'
import { createTestFile } from '../../helpers/create-test-file'

/**
 * Finds the call of the regular expression literal of a snippet.
 *
 * @param source - Snippet with one regular expression literal.
 * @returns The text of the call, or null when it is not the method of a string.
 */
function find(source: string): string | null {
  let file = createTestFile(source)
  let call = findStringMatchCall(file.find('Literal', '/a/'), file)
  return call && source.slice(call.start, call.end)
}

describe('findStringMatchCall', () => {
  it.each([
    ['function f(s: string) { return s.match(/a/) }', 's.match(/a/)'],
    ['function f(s?: string) { return s?.match(/a/) }', 's?.match(/a/)'],
    ['function f(s: string | null) { return s!.match(/a/) }', 's!.match(/a/)'],
    [
      'function f(s: string) { return s.match((/a/ as RegExp)) }',
      's.match((/a/ as RegExp))',
    ],
    ["x = 'b'.match(/a/)", "'b'.match(/a/)"],
    ['x = `b`.match(/a/)', '`b`.match(/a/)'],
    ['let s = "b"; x = s.match(/a/)', 's.match(/a/)'],
    [
      'function f(s: string) { return s.trim().match(/a/) }',
      's.trim().match(/a/)',
    ],
    ['x = String(y).match(/a/)', 'String(y).match(/a/)'],
    ['function f(s: string) { return s.match?.(/a/) }', 's.match?.(/a/)'],
  ])('finds the call in %s', (source, expected) => {
    expect(find(source)).toBe(expected)
  })

  it.each([
    's.match(/a/)',
    'stream.match(/a/)',
    'class L { stream = null; f() { return this.stream.match(/a/) } }',
    'class L { stream; f() { return this.stream?.match(/a/) } }',
    'function f(s = null) { return s.match(/a/) }',
    'function f(s: null) { return s.match(/a/) }',
    'function f(s: undefined) { return s?.match(/a/) }',
    'this.match(/a/)',
    'class A extends B { f() { return super.match(/a/) } }',
    'class A { #match(r) {} f() { return this.#match(/a/) } }',
    'function f(s: number) { return s.match(/a/) }',
    'function f(s: Scanner) { return s.match(/a/) }',
    'function f(s: string | number) { return s.match(/a/) }',
    'x = new Scanner().match(/a/)',
    'function f(s: string) { return s.match(/a/, 1) }',
    'function f(s: string) { return s.match(b, /a/) }',
    'function f(s: string) { return s["match"](/a/) }',
    'function f(s: string) { return s[match](/a/) }',
    'function f(s: string) { return s.replace(/a/) }',
    'function f(s: string) { return s.search(/a/) }',
    'function f(s: string) { return new s.match(/a/) }',
    'function f(s: string) { return match(/a/) }',
    'function f(s: string) { return s.match([/a/]) }',
    'x = /a/',
    '/a/(s)',
  ])('finds no call in %s', source => {
    expect(find(source)).toBeNull()
  })
})
