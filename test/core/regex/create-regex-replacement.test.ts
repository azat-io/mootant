import { describe, expect, it } from 'vitest'

import { createRegexReplacement } from '../../../core/regex/create-regex-replacement'
import { readTestRegex } from '../../helpers/read-test-regex'

/**
 * Settings of `recommended`.
 */
const SETTINGS = {
  coarseMutants: false,
  templates: true,
  timeouts: false,
  loggers: [],
}

describe('createRegexReplacement', () => {
  it('prints the whole literal with the focus', () => {
    let literal = readTestRegex('/ab/')

    expect(
      createRegexReplacement(
        literal,
        { change: { start: 1, text: '', end: 2 }, skip: null, flags: '' },
        SETTINGS,
      ),
    ).toStrictEqual({
      focus: { start: 6, text: '', end: 7 },
      node: literal.node,
      text: '/a/',
    })
  })

  it('prints new flags of a literal', () => {
    let literal = readTestRegex('/a/gi')

    expect(
      createRegexReplacement(
        literal,
        { change: null, flags: 'g', skip: null },
        SETTINGS,
      ),
    ).toStrictEqual({
      focus: { text: 'g', start: 7, end: 9 },
      node: literal.node,
      text: '/a/g',
    })
  })

  it('keeps the skip of the mutator', () => {
    let skip = { rule: 'edge-wildcard', reason: 'r' } as const

    expect(
      createRegexReplacement(
        readTestRegex('/a/'),
        { change: { text: '(', start: 0, end: 1 }, flags: '', skip },
        SETTINGS,
      ).skip,
    ).toBe(skip)
  })

  it.each([
    ['/a/', '(', ''],
    ['/a/', 'a/b', ''],
    ['/a/', 'a', 'gg'],
    ['String.raw`a`', '`', ''],
    ['String.raw`a`', '(', ''],
    ["'a'", '(', ''],
  ])(
    'skips the invalid regular expression of %s changed to %o with %o',
    (regex, text, flags) => {
      let source = readTestRegex(
        regex.startsWith('/') ? regex : `RegExp(${regex})`,
      )

      expect(
        createRegexReplacement(
          source,
          { change: { start: 0, end: 1, text }, skip: null, flags },
          SETTINGS,
        ).skip?.rule,
      ).toBe('invalid-regex')
    },
  )

  it.each([
    ['String.raw`a`', '\\`'],
    ["'a'", 'a/b'],
  ])('accepts what the form of %s can hold, such as %o', (pattern, text) => {
    expect(
      createRegexReplacement(
        readTestRegex(`RegExp(${pattern})`),
        { change: { start: 0, end: 1, text }, skip: null, flags: '' },
        SETTINGS,
      ).skip,
    ).toBeUndefined()
  })

  it.each([
    { rule: 'empty-match', regex: '/a+/g', flags: 'g' },
    { rule: 'empty-match', regex: '/a+/y', flags: 'y' },
    { rule: undefined, regex: '/a+/', flags: '' },
    { rule: undefined, regex: '/a*/g', flags: 'g' },
  ])(
    'judges the empty match of $regex changed to a* with $flags',
    ({ regex, flags, rule }) => {
      expect(
        createRegexReplacement(
          readTestRegex(regex),
          { change: { text: '*', start: 1, end: 2 }, skip: null, flags },
          SETTINGS,
        ).skip?.rule,
      ).toBe(rule)
    },
  )

  it('keeps a change of the flags alone with g', () => {
    expect(
      createRegexReplacement(
        readTestRegex('/a/'),
        { change: null, skip: null, flags: 'g' },
        SETTINGS,
      ).skip,
    ).toBeUndefined()
  })

  it('keeps a pattern that starts to match empty with the timeouts setting', () => {
    expect(
      createRegexReplacement(
        readTestRegex('/a+/g'),
        { change: { text: '*', start: 1, end: 2 }, skip: null, flags: 'g' },
        { coarseMutants: false, templates: true, timeouts: true, loggers: [] },
      ).skip,
    ).toBeUndefined()
  })

  it('skips an edit that merges the tokens around it', () => {
    expect(
      createRegexReplacement(
        readTestRegex(String.raw`/(a)\1?0/`),
        { change: { start: 5, text: '', end: 6 }, skip: null, flags: '' },
        SETTINGS,
      ).skip?.rule,
    ).toBe('invalid-regex')
  })

  it('prints the string argument of a call with its escapes', () => {
    let source = readTestRegex(String.raw`new RegExp('^\\d+$')`)

    expect(
      createRegexReplacement(
        source,
        { change: { text: '[^]', start: 1, end: 3 }, skip: null, flags: '' },
        SETTINGS,
      ),
    ).toStrictEqual({
      focus: { text: '[^]', start: 17, end: 20 },
      node: source.node,
      text: "'^[^]+$'",
    })
  })
})
