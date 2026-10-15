import { describe, expect, it, vi } from 'vitest'
import { existsSync } from 'node:fs'
import path from 'node:path'

import { getPackageDirectory } from '../../../core/run/get-package-directory'

vi.mock(import('node:fs'), async importOriginal => {
  let actual = await importOriginal()
  return { ...actual, existsSync: vi.fn(actual.existsSync) }
})

describe('getPackageDirectory', () => {
  it('finds the directory of mootant from this module', () => {
    expect(getPackageDirectory()).toBe(
      path.resolve(import.meta.dirname, '../../..'),
    )
  })

  it('falls back to the start without a package file above it', () => {
    vi.mocked(existsSync).mockReturnValue(false)
    let start = path.resolve('/a/b')

    expect(getPackageDirectory(start)).toBe(start)
  })
})
