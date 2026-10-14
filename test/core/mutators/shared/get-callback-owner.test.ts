import { describe, expect, it } from 'vitest'

import { getCallbackOwner } from '../../../../core/mutators/shared/get-callback-owner'
import { createTestContext } from '../../../helpers/create-test-context'

describe('getCallbackOwner', () => {
  it.each<[string, string | null]>([
    ['rows.sort(r => r)', 'sort'],
    ['rows.sort((r => r) as any)', 'sort'],
    ['let rows: string[] = []; rows.sort(r => r)', 'sort'],
    ['rows?.toSorted(function (r) { return r })', 'toSorted'],
    ['rows.filter(r => r)', null],
    ['rows.map(r => r)', null],
    ['rows.sort(other, r => r)', null],
    ['sort(r => r)', null],
    ["rows['sort'](r => r)", null],
    ['(rows.sort)(r => r)', null],
    ['interface Q { id: string }; let q: Q = f(); q.sort(r => r)', null],
    ['class A extends B { m() { super.sort(r => r) } }', null],
    ['class A { #sort(f) {} m() { this.#sort(r => r) } }', null],
    ['x = r => r', null],
  ])('finds the owner in %s', (source, expected) => {
    let { context, find } = createTestContext(source)
    let callback = context.sourceCode.getParent(find('Identifier', 'r'))!

    expect(getCallbackOwner(callback, context)).toBe(expected)
  })
})
