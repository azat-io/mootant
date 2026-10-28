import { describe, expect, it } from 'vitest'

import { getModuleFile } from '../../../adapters/vitest/get-module-file'

describe('getModuleFile', () => {
  it('keeps an absolute path without its query or hash', () => {
    expect(getModuleFile('/p/a.ts')).toBe('/p/a.ts')
    expect(getModuleFile('/p/a.ts?v=1')).toBe('/p/a.ts')
    expect(getModuleFile('/p/a.ts#x')).toBe('/p/a.ts')
  })

  it.each([
    'node:fs',
    'virtual:x',
    '\0virtual:x',
    '/p/node_modules/x/index.js',
  ])('rejects %s', id => {
    expect(getModuleFile(id)).toBeNull()
  })
})
