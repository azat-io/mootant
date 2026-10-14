import { describe, expect, it } from 'vitest'

import { createInferenceSnippet } from '../../helpers/create-inference-snippet'
import { getMemberPath } from '../../../core/syntax/get-member-path'

describe('getMemberPath', () => {
  it.each([
    ['a', 'a', ['a']],
    ['this', 'this', ['this']],
    ['this.logger.info', 'this.logger.info', ['this', 'logger', 'info']],
    ['class A extends B { m() { super.m } }', 'super.m', ['super', 'm']],
    ['function f() { new.target }', 'new.target', ['new', 'target']],
    ['import.meta.url', 'import.meta.url', ['import', 'meta', 'url']],
    ['a?.b.c', 'a?.b.c', ['a', 'b', 'c']],
    ['(a?.b).c', '(a?.b).c', ['a', 'b', 'c']],
    ['(a as any).b', '(a as any).b', ['a', 'b']],
    ['a!.b', 'a!.b', ['a', 'b']],
    ["a['b-c']", "a['b-c']", ['a', 'b-c']],
    ['(a).b', '(a).b', ['a', 'b']],
    ['((a))', '((a))', ['a']],
    ['class A { #x = 1; m() { this.#x } }', 'this.#x', ['this', '#x']],
  ])('reads the path of %s', (source, text, expected) => {
    expect(
      getMemberPath(createInferenceSnippet(source).find(text)),
    ).toStrictEqual(expected)
  })

  it.each([
    ['a[0]'],
    ['a[b]'],
    ['a[`b`]'],
    ['f().b'],
    ['a.b()'],
    ['a?.()'],
    ['1'],
    ['(a + b).c'],
    ['a[0].b'],
  ])('returns null for %s', source => {
    expect(
      getMemberPath(createInferenceSnippet(source).find(source)),
    ).toBeNull()
  })
})
