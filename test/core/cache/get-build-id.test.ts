import { describe, expect, it, vi } from 'vitest'

import { getBuildId } from '../../../core/cache/get-build-id'
import { BUILD_HASH } from '../../../core/cache/build-hash'

describe('getBuildId', () => {
  it('gives a built module the hash the build wrote', () => {
    expect(getBuildId('/p/node_modules/mootant/dist/core/cache/a.js')).toBe(
      BUILD_HASH,
    )
  })

  it('gives the sources an id of their own in each process', async () => {
    let id = getBuildId()
    vi.resetModules()
    let fresh = await import('../../../core/cache/get-build-id')

    expect(id).not.toBe(BUILD_HASH)
    expect(getBuildId()).toBe(id)
    expect(fresh.getBuildId()).not.toBe(id)
  })
})
