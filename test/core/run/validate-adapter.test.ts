import { describe, expect, it } from 'vitest'

import { validateAdapter } from '../../../core/run/validate-adapter'

describe('validateAdapter', () => {
  it('accepts an adapter object', () => {
    let adapter = {
      start: () => null,
      name: 'jest-like',
      version: '1.0.0',
      batch: false,
    }

    expect(validateAdapter(adapter, 'jest-like')).toBe(adapter)

    let parallel = { ...adapter, parallelUnits: true }

    expect(validateAdapter(parallel, 'jest-like')).toBe(parallel)
  })

  it.each<[unknown, string]>([
    [null, 'it must be an object'],
    [
      { start: () => null, name: 'Jest', batch: true },
      '"name" must be a kebab-case name',
    ],
    [{ start: () => null, batch: true }, '"name" must be a kebab-case name'],
    [
      { start: () => null, name: 'jest', batch: 1 },
      '"batch" must be true or false',
    ],
    [{ name: 'jest', batch: true }, '"start" must be a function'],
    [
      { start: () => null, name: 'jest', batch: true, version: 1 },
      '"version" must be a string',
    ],
    [
      { start: () => null, parallelUnits: 1, name: 'jest', batch: true },
      '"parallelUnits" must be true or false',
    ],
  ])('rejects %o', (value, problem) => {
    expect(() => validateAdapter(value, 'acme')).toThrow(
      `The test runner adapter "acme" is invalid: ${problem}.`,
    )
  })
})
