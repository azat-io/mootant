import { describe, expect, it } from 'vitest'

import { getCachePath } from '../../../core/cache/get-cache-path'
import { CACHE_VERSION } from '../../../core/cache/cache-version'

describe('CACHE_VERSION', () => {
  it('names the version in the cache file name', () => {
    expect(CACHE_VERSION).toBe(8)
    expect(getCachePath('/p')).toMatch(/run-v8\.json$/u)
  })
})
