import { describe, expect, it } from 'vitest'

import { getCachePath } from '../../../core/cache/get-cache-path'
import { CACHE_VERSION } from '../../../core/cache/cache-version'

describe('cACHE_VERSION', () => {
  it('names the version in the cache file name', () => {
    expect(CACHE_VERSION).toBe(3)
    expect(getCachePath('/p')).toMatch(/run-v3\.json$/u)
  })
})
