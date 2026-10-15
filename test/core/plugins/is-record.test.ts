import { describe, expect, it } from 'vitest'

import { isRecord } from '../../../core/plugins/is-record'

describe('isRecord', () => {
  it.each<[unknown, boolean]>([
    [{}, true],
    [{ a: 1 }, true],
    [Object.create(null), true],
    [null, false],
    [[], false],
    ['on', false],
    [() => {}, false],
    [undefined, false],
  ])('answers %o with %s', (value, expected) => {
    expect(isRecord(value)).toBe(expected)
  })
})
