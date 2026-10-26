import { describe, expect, it } from 'vitest'
import path from 'node:path'

import { getCachePath } from '../../../core/cache/get-cache-path'

describe('getCachePath', () => {
  it('puts the cache file in node_modules/.cache of the root', () => {
    expect(getCachePath('/project')).toBe(
      path.join('/project', 'node_modules/.cache/mootant/run-v3.json'),
    )
  })
})
