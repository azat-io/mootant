import { describe, expect, it } from 'vitest'

import { getRegexUsage } from '../../../core/regex/get-regex-usage'
import { createTestFile } from '../../helpers/create-test-file'

describe('getRegexUsage', () => {
  it.each([
    ["s.replace(/a/g, '')", 'replace'],
    ['s.match(/a/g)', 'match'],
    ['s?.match(/a/g)', 'match'],
    ["s.replace((/a/g), '')", 'replace'],
    ["s.replace(/a/g as RegExp, '')", 'replace'],
    ['s.matchAll(/a/g)', null],
    ["s.replaceAll(/a/g, '')", null],
    ["s.replace('', /a/g)", null],
    ['s[name](/a/g)', null],
    ['match(/a/g)', null],
    ['x = /a/g', null],
    ['/a/g.exec(s)', null],
  ])('tells the use of the literal in %s', (source, expected) => {
    let { syntax, find } = createTestFile(source)

    expect(getRegexUsage(find('Literal', '/a/g'), syntax)).toBe(expected)
  })
})
