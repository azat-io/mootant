import { describe, expect, it } from 'vitest'

import { isVirtualModule } from '../../../adapters/vitest/is-virtual-module'

describe('isVirtualModule', () => {
  it.each([
    '\0virtual:limits',
    'virtual:limits',
    'virtual:limits?raw',
    '\0virtual:limits?source=/p/node_modules/pkg/data',
    'virtual:limits#/p/node_modules/pkg/data',
    '\0/p/node_modules/x/index.js?commonjs-proxy',
  ])('accepts %s', id => {
    expect(isVirtualModule(id)).toBe(true)
  })

  it.each(['', '/p/limits.json', 'node:fs', 'fs'])('rejects %s', id => {
    expect(isVirtualModule(id)).toBe(false)
  })
})
