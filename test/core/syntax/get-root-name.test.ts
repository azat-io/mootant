import { describe, expect, it } from 'vitest'

import { getRootName } from '../../../core/syntax/get-root-name'
import { createTestFile } from '../../helpers/create-test-file'

describe('getRootName', () => {
  it.each([
    ['x = items', 'items'],
    ['x = items[0]', 'items'],
    ['x = items.list.length', 'items'],
    ['x = items?.list', 'items'],
    ['x = items.get(0).name', 'items'],
    ['x = (items as T[])!.length', 'items'],
    ['x = ((items)).length', 'items'],
    ['x = this.count', 'this'],
    ['x = this', 'this'],
    ['x = f().name', 'f'],
    ['x = [1][0]', null],
    ['x = (a + b).c', null],
    ['x = 1', null],
  ])('finds the root of %s', (source, expected) => {
    let { find } = createTestFile(source)
    let value = find('AssignmentExpression').right

    expect(getRootName(value)).toBe(expected)
  })
})
