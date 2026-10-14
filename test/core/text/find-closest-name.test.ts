import { describe, expect, it } from 'vitest'

import { findClosestName } from '../../../core/text/find-closest-name'

/**
 * Names of the built-in presets, sorted.
 */
const PRESETS = ['recommended', 'strict']

/**
 * Names of a few mutators, sorted.
 */
const MUTATORS = ['arithmetic-operator', 'string-literal', 'unary-operator']

describe('findClosestName', () => {
  it.each([
    ['recommended', PRESETS, 'recommended'],
    // spell-checker: disable-next-line
    ['recomended', PRESETS, 'recommended'],
    ['Strict', PRESETS, 'strict'],
    // spell-checker: disable-next-line
    ['strng-literal', MUTATORS, 'string-literal'],
    // spell-checker: disable-next-line
    ['string-literl', MUTATORS, 'string-literal'],
    // spell-checker: disable-next-line
    ['aritmetic-operator', MUTATORS, 'arithmetic-operator'],
    ['ab', ['a', 'abcd'], 'a'],
    ['abc', ['xyz', 'abd'], 'abd'],
  ])('suggests a name close to %j', (name, candidates, expected) => {
    expect(findClosestName(name, candidates)).toBe(expected)
  })

  it.each([
    ['strictly-typed', PRESETS],
    ['literal', MUTATORS],
    // spell-checker: disable-next-line
    ['abcde', ['xyzde']],
    ['', ['abc']],
  ])('suggests nothing for %j', (name, candidates) => {
    expect(findClosestName(name, candidates)).toBeNull()
  })

  it('accepts a distance of a third of a long name', () => {
    // spell-checker: disable-next-line
    expect(findClosestName('abcdefghi', ['abcdefxyz'])).toBe('abcdefxyz')
    // spell-checker: disable-next-line
    expect(findClosestName('abcdefghi', ['abcdewxyz'])).toBeNull()
  })

  it('accepts a distance of 2 for a short name', () => {
    expect(findClosestName('ab', ['xy'])).toBe('xy')
    expect(findClosestName('ab', ['xyz'])).toBeNull()
  })

  it('resolves a tie to the first candidate', () => {
    expect(findClosestName('abc', ['abx', 'aby'])).toBe('abx')
    expect(findClosestName('abc', ['aby', 'abx'])).toBe('aby')
  })

  it('suggests nothing without candidates', () => {
    expect(findClosestName('strict', [])).toBeNull()
  })
})
