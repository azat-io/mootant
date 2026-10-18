import { describe, expect, it, vi } from 'vitest'

import { scoreNodeTest } from '../../adapters/node-test/score-node-test'
import { detectVitest } from '../../adapters/vitest/detect-vitest'
import { getBuiltInAdapters } from '../../cli/built-in-adapters'

vi.mock(import('../../adapters/vitest/detect-vitest'))
vi.mock(import('../../adapters/node-test/score-node-test'))

describe('getBuiltInAdapters', () => {
  it('detects a supported Vitest from the root', async () => {
    vi.mocked(detectVitest).mockResolvedValue({
      node: '/repo/node_modules/vitest/dist/node.js',
      version: '5.0.4',
      available: true,
    })

    await expect(getBuiltInAdapters()['vitest']!.detect('/repo')).resolves.toBe(
      1,
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
      0,
    )
  })

  it('detects Vitest of another major version, so starting names it', async () => {
    vi.mocked(detectVitest).mockResolvedValue({
      available: false,
      version: '4.1.0',
      node: null,
    })

    await expect(getBuiltInAdapters()['vitest']!.detect('/repo')).resolves.toBe(
      1,
    )
  })

  it('loads the Vitest adapter with default options', async () => {
    let adapter = await getBuiltInAdapters()['vitest']!.load()

    expect(adapter).toMatchObject({ name: 'vitest', batch: true })
  })
  it('lists Vitest before node:test, the order of a tie', () => {
    expect(Object.keys(getBuiltInAdapters())).toStrictEqual([
      'vitest',
      'node-test',
    ])
  })

  it('detects node:test with its score', async () => {
    vi.mocked(scoreNodeTest).mockResolvedValue(2)

    await expect(
      getBuiltInAdapters()['node-test']!.detect('/repo'),
    ).resolves.toBe(2)
    expect(scoreNodeTest).toHaveBeenCalledExactlyOnceWith('/repo')
  })

  it('loads the node:test adapter with default options', async () => {
    let adapter = await getBuiltInAdapters()['node-test']!.load()

    expect(adapter).toMatchObject({ name: 'node-test', batch: false })
  })
})
