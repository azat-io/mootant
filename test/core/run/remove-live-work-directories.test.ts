import { writeFile, mkdtemp, stat, rm } from 'node:fs/promises'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { removeLiveWorkDirectories } from '../../../core/run/remove-live-work-directories'
import { LIVE_WORK_DIRECTORIES } from '../../../core/run/live-work-directories'

vi.mock(import('node:fs'), async importOriginal => {
  let actual = await importOriginal()
  return { ...actual, rmSync: vi.fn(actual.rmSync) }
})

describe('removeLiveWorkDirectories', () => {
  afterEach(() => {
    LIVE_WORK_DIRECTORIES.clear()
    vi.mocked(rmSync).mockClear()
  })

  it('removes every live work directory with its files and forgets them', async () => {
    let first = await mkdtemp(path.join(tmpdir(), 'mootant-live-'))
    let second = await mkdtemp(path.join(tmpdir(), 'mootant-live-'))
    await writeFile(path.join(first, 'plan.json'), '{}')
    LIVE_WORK_DIRECTORIES.add(first)
    LIVE_WORK_DIRECTORIES.add(second)

    removeLiveWorkDirectories()

    await expect(stat(first)).rejects.toThrow('ENOENT')
    await expect(stat(second)).rejects.toThrow('ENOENT')
    expect(LIVE_WORK_DIRECTORIES.size).toBe(0)
  })

  it('goes on past a directory it cannot remove', async () => {
    let kept = await mkdtemp(path.join(tmpdir(), 'mootant-live-'))
    let removed = await mkdtemp(path.join(tmpdir(), 'mootant-live-'))
    vi.mocked(rmSync).mockImplementationOnce(() => {
      throw new Error('EBUSY: resource busy or locked')
    })
    LIVE_WORK_DIRECTORIES.add(kept)
    LIVE_WORK_DIRECTORIES.add(removed)

    expect(() => {
      removeLiveWorkDirectories()
    }).not.toThrow()
    await expect(stat(kept)).resolves.toBeDefined()
    await expect(stat(removed)).rejects.toThrow('ENOENT')
    expect(LIVE_WORK_DIRECTORIES.size).toBe(0)

    await rm(kept, { recursive: true, force: true })
  })
})
