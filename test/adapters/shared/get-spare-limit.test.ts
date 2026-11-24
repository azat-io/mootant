import { afterEach, describe, expect, it, vi } from 'vitest'
import { availableParallelism } from 'node:os'

import { getSpareLimit } from '../../../adapters/shared/get-spare-limit'

vi.mock(import('node:os'), async importOriginal => {
  let actual = await importOriginal()
  return { ...actual, availableParallelism: vi.fn(() => 6) }
})

describe('getSpareLimit', () => {
  afterEach(() => {
    vi.mocked(availableParallelism).mockReset()
  })

  it('gives the cores the running processes leave free, at least one, at most as many as run', () => {
    vi.mocked(availableParallelism).mockReturnValue(6)

    expect(getSpareLimit(3)).toBe(3)
    expect(getSpareLimit(4)).toBe(2)
    expect(getSpareLimit(5)).toBe(1)
    expect(getSpareLimit(8)).toBe(1)
    expect(getSpareLimit(1)).toBe(1)
  })
})
