import { describe, expect, it } from 'vitest'
import { realpathSync } from 'node:fs'
import path from 'node:path'

import { getFileKey } from '../../../adapters/vitest/get-file-key'

describe('getFileKey', () => {
  it('uses the real path and caches it', () => {
    let cache = new Map<string, string>()
    let file = path.resolve(import.meta.dirname, '../../../package.json')

    expect(getFileKey(file, cache)).toBe(realpathSync.native(file))

    cache.set(file, 'cached')

    expect(getFileKey(file, cache)).toBe('cached')
  })

  it('resolves a path that does not exist', () => {
    expect(getFileKey('/missing/../file.ts', new Map())).toBe(
      path.resolve('/file.ts'),
    )
  })
})
