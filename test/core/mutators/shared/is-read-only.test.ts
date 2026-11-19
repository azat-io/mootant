import { describe, expect, it } from 'vitest'

import { isReadOnly } from '../../../../core/mutators/shared/is-read-only'
import { createTestContext } from '../../../helpers/create-test-context'

describe('isReadOnly', () => {
  it.each<[string, boolean]>([
    ['order.coupon', true],
    ['!order.coupon && total > 100', true],
    [`\`\${a}\` === b || key in cache || value instanceof Error`, true],
    ['seen.has(key)', true],
    ['seen?.has(key)', true],
    ['seen.has?.(key)', true],
    ['(seen as Set<string>).has(key)', true],
    ["name.toLowerCase().includes('admin')", true],
    ['Array.isArray(value) && value.length > 0', true],
    ['items.some(item => item.done)', true],
    ['items.some(([flag]) => flag)', true],
    ['items.find((item, index) => index > item.start)', true],
    ['/a/g.test(text)', true],
    ['map.get(key)', false],
    ['map.delete(key)', false],
    ['map.delete(key) && seen.has(key)', false],
    ['load().some(item => item.done)', false],
    ['(cache.set(key, 1), cache.has(key))', false],
    ['ready ? load() : seen.has(key)', false],
    ['count++ > 0 && seen.has(key)', false],
    ['isValid(key)', false],
    ['context.syntax.isValid(key)', false],
    ["seen['has'](key)", false],
    ['seen.has(load(key))', false],
    ['load(key).has(key)', false],
    ['items.some(isDone)', false],
    ['items.some()', false],
    ['items.some(item => { return item.done })', false],
    ['items.some(async item => item.done)', false],
    ['items.some(item => item.save())', false],
    ['items.some((item = load()) => item)', false],
    ['(item => item.done)(first)', false],
    ['[...items].includes(key)', false],
    ['await exists(key)', false],
    ['new Set(items).has(key)', false],
    ['(count = next()) > 0', false],
    ['count++ > 0', false],
    ['delete cache[key]', false],
    ['tag`a`', false],
    ['import(path)', false],
    ['function () {}', false],
    ['class {}', false],
  ])('answers %s with %s', (source, expected) => {
    let { context, find } = createTestContext(
      `async function f() { if (${source}) go() }`,
    )

    expect(isReadOnly(find('IfStatement').test, context)).toBe(expected)
  })

  it.each<[string, boolean]>([
    ['const RE = /a/u; if (RE.test(text)) go()', true],
    ['const RE = /a/u; if (RE.exec(text)) go()', true],
    ['let re = /a/u; if (re.test(text)) go()', true],
    ['var re = /a/u; if (re.test(text)) go()', false],
    ['var re = /a/u; var re = /a/g; if (re.test(text)) go()', false],
    ['const RE = /a/gu; if (RE.test(text)) go()', false],
    ['const RE = /a/y; if (RE.test(text)) go()', false],
    ['let re = /a/u; re = /b/u; if (re.test(text)) go()', false],
    ['function f(re: RegExp) { if (re.test(text)) go() }', false],
    ['const { re } = patterns; if (re.test(text)) go()', false],
    ['const RE = new RegExp(source); if (RE.test(text)) go()', false],
    ['if (re.test(text)) go()', false],
    ['class A { #has() {} m() { if (this.#has()) go() } }', false],
    ['function* f() { if (yield) go() }', false],
  ])('answers %s with %s', (source, expected) => {
    let { context, find } = createTestContext(source)

    expect(isReadOnly(find('IfStatement').test, context)).toBe(expected)
  })

  it('treats a regex run as an effect while the file reads the statics', () => {
    let { context, find } = createTestContext('if (/(a)/.test(text)) go()')
    let statics = {
      ...context,
      syntax: { ...context.syntax, readsRegexStatics: () => true },
    }

    expect(isReadOnly(find('IfStatement').test, statics)).toBe(false)
  })
})
