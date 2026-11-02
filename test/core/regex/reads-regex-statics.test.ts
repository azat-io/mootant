import { describe, expect, it } from 'vitest'

import { readsRegexStatics } from '../../../core/regex/reads-regex-statics'

describe('readsRegexStatics', () => {
  it.each([
    'x = RegExp.$1',
    "x = RegExp['$&']",
    'x = RegExp.lastMatch',
    'x = RegExp?.$1',
    'x = RegExp?.[key]',
    'x = RegExp [key]',
    'x = RegExp\n  .lastMatch',
    'x = RegExp /* c */ .lastMatch',
    'x = RegExp // c\n  .lastMatch',
    'x = RegExp!.lastMatch',
    'x = (<any>RegExp).lastMatch',
    'x = (RegExp as any).lastMatch',
    'x = (RegExp).lastParen',
    'x = globalThis.RegExp.$1',
    "x = globalThis['RegExp']['$1']",
    'x = RegExp.prototype.test',
    'x = globalThis.RegExp',
    'x = [RegExp]',
    'x = y ? RegExp : z',
    'f(a, RegExp)',
    'function f() { return RegExp }',
    'let { lastMatch } = RegExp',
    "let { '$&': whole } = RegExp",
    'let R = RegExp; x = R.$1',
    "x = Reflect.get(RegExp, '$&')",
    'x = (r => r.lastMatch)(RegExp)',
    'let re: RegExp',
    'let list: RegExp[] = []',
    'x = y instanceof RegExp',
    '// Escapes a text for use in a RegExp.\nx = 1',
  ])('counts %s', code => {
    expect(readsRegexStatics(code)).toBe(true)
  })

  it.each([
    'x = /a/.test(s)',
    "x = new RegExp('a')",
    "x = RegExp('a')",
    "x = RegExp ('a')",
    "x = RegExp\n  ('a')",
    "f(RegExp('a'))",
    "x = globalThis.RegExp('a')",
    'let match: RegExpMatchArray',
    'let myRegExp = /a/; myRegExp.test(s)',
    "x = s.replace(/(a)/, '$1')",
    "function f(s) { return s.replace(/(a)/, '$1-') }",
    "x = ['$set', '$inc']",
    "x = schema['$schema']",
    'let lastMatch = null',
  ])('does not count %s', code => {
    expect(readsRegexStatics(code)).toBe(false)
  })
})
