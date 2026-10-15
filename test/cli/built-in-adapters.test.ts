import { describe, expect, it, vi } from 'vitest'

import { detectVitest } from '../../adapters/vitest/detect-vitest'
import { getBuiltInAdapters } from '../../cli/built-in-adapters'

vi.mock(import('../../adapters/vitest/detect-vitest'))

describe('getBuiltInAdapters', () => {
  it('detects a supported Vitest from the root', async () => {
    vi.mocked(detectVitest).mockResolvedValue({
      node: '/repo/node_modules/vitest/dist/node.js',
      version: '5.0.4',
      available: true,
    })

    await expect(getBuiltInAdapters()['vitest']!.detect('/repo')).resolves.toBe(
      true,
    )
    expect(detectVitest).toHaveBeenCalledExactlyOnceWith('/repo')
  })

  it('does not detect a project without Vitest', async () => {
    vi.mocked(detectVitest).mockResolvedValue({
      available: false,
      version: null,
      node: null,
    })

    await expect(getBuiltInAdapters()['vitest']!.detect('/repo')).resolves.toBe(
      false,
    )
  })

  it('detects Vitest of another major version, so starting names it', async () => {
    vi.mocked(detectVitest).mockResolvedValue({
      available: false,
      version: '4.1.0',
      node: null,
    })

    await expect(getBuiltInAdapters()['vitest']!.detect('/repo')).resolves.toBe(
      true,
    )
  })

  it('loads the Vitest adapter with default options', async () => {
    let adapter = await getBuiltInAdapters()['vitest']!.load()

    expect(adapter).toMatchObject({ name: 'vitest', batch: true })
  })
})
