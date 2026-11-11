import { describe, expect, it } from 'vitest'

import { getJestCacheDirectory } from '../../../adapters/jest/get-jest-cache-directory'

describe('getJestCacheDirectory', () => {
  it("gives mootant's directory in the cache of the project's node_modules", () => {
    expect(getJestCacheDirectory('/p')).toBe(
      '/p/node_modules/.cache/mootant/jest',
    )
  })
})
