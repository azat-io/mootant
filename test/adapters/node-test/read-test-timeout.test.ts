import { describe, expect, it } from 'vitest'

import { readTestTimeout } from '../../../adapters/node-test/read-test-timeout'

describe('readTestTimeout', () => {
  it('reads the last --test-timeout', () => {
    expect(readTestTimeout(['--import', 'tsx'])).toBe(0)
    expect(readTestTimeout(['--test-timeout=5000'])).toBe(5000)
    expect(
      readTestTimeout(['--test-timeout', '100', '--test-timeout=200']),
    ).toBe(200)
    expect(readTestTimeout(['--test-timeout=x'])).toBe(0)
    expect(readTestTimeout(['--test-timeout'])).toBe(0)
  })
})
