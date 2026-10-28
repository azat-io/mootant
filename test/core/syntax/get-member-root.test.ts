import { describe, expect, it } from 'vitest'

import { getMemberRoot } from '../../../core/syntax/get-member-root'
import { createTestFile } from '../../helpers/create-test-file'

describe('getMemberRoot', () => {
  it.each([
    ['x = items', 'items'],
    ['x = items[0].name', 'items'],
    ['x = items?.list.length', 'items'],
    ['x = (items?.list).length', 'items'],
    ['x = (items as T[])!.length', 'items'],
    ['x = ((items)).length', 'items'],
    ['x = (items.list as T)', 'items'],
    ['x = this.count', 'this'],
    ['x = a.b().c', 'a.b()'],
    ['x = f().name', 'f()'],
    ['x = (a + b).c', 'a + b'],
  ])('finds the root of %s', (source, expected) => {
    let { find } = createTestFile(source)
    let root = getMemberRoot(find('AssignmentExpression').right)

    expect(source.slice(root.start, root.end)).toBe(expected)
  })
})
