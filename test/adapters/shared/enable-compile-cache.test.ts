import { describe, expect, it, vi } from 'vitest'
import path from 'node:path'

import { enableCompileCache } from '../../../adapters/shared/enable-compile-cache'

describe('enableCompileCache', () => {
  it('turns the cache on in the compile-cache folder of the work directory', () => {
    let enable = vi.fn()
    enableCompileCache({ enableCompileCache: enable }, '/work')

    expect(enable).toHaveBeenCalledExactlyOnceWith(
      path.join('/work', 'compile-cache'),
    )
  })

  it('does nothing on a Node without the cache, and when Node throws', () => {
    expect(() => {
      enableCompileCache({}, '/work')
      enableCompileCache(
        {
          enableCompileCache: () => {
            throw new TypeError('cacheDir should be a string')
          },
        },
        '/work',
      )
    }).not.toThrow()
  })
})
