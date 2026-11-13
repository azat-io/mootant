import { describe, expect, it } from 'vitest'

import { renderBranch } from '../../../core/instrument/render-branch'

describe('renderBranch', () => {
  it.each([
    'a, b',
    '/x/g',
    "'<!--'",
    '/a<!--x/',
    '/<!--x/ +',
    '!(/<!--x/.test(s))',
    'a || (/<!--x/)',
    '++(/<!--x/.lastIndex)',
    'new (/<!--x/.constructor)()',
    '<string>/<!--x/.source',
  ])('writes %j in parentheses', text => {
    expect(renderBranch(text)).toBe(`(${text})`)
  })

  it.each([
    '/<!--x/g',
    '/ <!--x/',
    '\n/<!--x/',
    '/* note */ /<!--x/.test(s)',
    '/<!--x/.test(s), ok',
    '/<!--x/.test(s) ? a : b',
    '/<!--x/.lastIndex + 1',
    '/<!--x/.lastIndex++',
    '/<!--x/g as RegExp',
    '/<!--x/ satisfies RegExp',
    '/<!--x/.exec(s)!.index',
    '/<!--x/.exec(s)?.index',
    '/<!--x/.test`s`',
    '/<!--x/.test.bind<RegExp>',
  ])(
    'writes %j after 0 in parentheses, as it starts with a regular expression oxc misreads after (',
    text => {
      expect(renderBranch(text)).toBe(`(0, ${text})`)
    },
  )

  it.each([
    ['(/<!--x/.exec(s) ?? 1) || 2', '((0, /<!--x/.exec(s) ?? 1) || 2)'],
    ['(/* note */ /<!--x/.test(s))', '((0, /* note */ /<!--x/.test(s)))'],
    ['(/<!--x/).exec(s)?.index', '((0, /<!--x/).exec(s)?.index)'],
    ['( (/<!--x/))', '(( (0, /<!--x/)))'],
  ])(
    'puts 0 into the parentheses of %j, which hold a value',
    (text, branch) => {
      expect(renderBranch(text)).toBe(branch)
    },
  )

  it.each([
    '(/<!--x/.test)(s)',
    '(/<!--x/.test)?.(s)',
    '(/<!--x/.test)!(s)',
    '(/<!--x/.raw)`s`',
    '(/<!--x/.lastIndex)++',
    '(/<!--x/.lastIndex) = 1',
  ])(
    'leaves the parentheses of %j around a callee, a tag or a write target',
    text => {
      expect(renderBranch(text)).toBe(`(${text})`)
    },
  )
})
