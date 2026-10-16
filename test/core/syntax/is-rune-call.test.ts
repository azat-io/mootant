import { describe, expect, it } from 'vitest'

import { createTestFile } from '../../helpers/create-test-file'
import { isRuneCall } from '../../../core/syntax/is-rune-call'

describe('isRuneCall', () => {
  it.each([
    ['let count = $state(0)', '$state(0)'],
    ['let items = $state.raw([])', '$state.raw([])'],
    ['let double = $derived(count * 2)', '$derived(count * 2)'],
    ['let total = $derived.by(() => sum)', '$derived.by(() => sum)'],
    ['let { a } = $props()', '$props()'],
    ['let { a = $bindable() } = $props()', '$bindable()'],
    ['class A { count = $state(0) }', '$state(0)'],
    ['let count = ($state(0) as number)', '$state(0)'],
    ['let id = $props.id()', '$props.id()'],
    ['class A { constructor() { this.n = $state(0) } }', '$state(0)'],
    ['class A { constructor() { this.#n = $state(0) } }', '$state(0)'],
  ])('accepts the rune in %s', (source, text) => {
    let { find, tree } = createTestFile(source)

    expect(isRuneCall(tree, find('CallExpression', text))).toBe(true)
  })

  it.each([
    ['use($state(0))', '$state(0)'],
    ['let count = state(0)', 'state(0)'],
    ['let count = $effect(() => {})', '$effect(() => {})'],
    ['let count = this[key](0)', 'this[key](0)'],
    ['count = $state(0)', '$state(0)'],
    ['this.n = $state(0)', '$state(0)'],
    ['class A { set() { this.n = $state(0) } }', '$state(0)'],
    ['class A { constructor() { a.n = $state(0) } }', '$state(0)'],
    ['class A { constructor() { this.n += $state(0) } }', '$state(0)'],
    ['class A { constructor() { this.n = h || $state(0) } }', '$state(0)'],
  ])('rejects the call in %s', (source, text) => {
    let { find, tree } = createTestFile(source)

    expect(isRuneCall(tree, find('CallExpression', text))).toBe(false)
  })

  it('rejects a node that is not a call', () => {
    let { find, tree } = createTestFile('let count = $state')

    expect(isRuneCall(tree, find('Identifier', '$state'))).toBe(false)
  })
})
