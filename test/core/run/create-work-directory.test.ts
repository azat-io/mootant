import { writeFile, stat } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { LIVE_WORK_DIRECTORIES } from '../../../core/run/live-work-directories'
import { createWorkDirectory } from '../../../core/run/create-work-directory'

describe('createWorkDirectory', () => {
  it('creates a fresh directory and removes it with its files', async () => {
    let work = await createWorkDirectory()
    let other = await createWorkDirectory()
    await writeFile(path.join(work.path, 'plan.json'), '{}')

    expect(path.dirname(work.path)).toBe(path.resolve(tmpdir()))
    expect(path.basename(work.path)).toMatch(/^mootant-/u)
    expect(other.path).not.toBe(work.path)

    await work.remove()
    await other.remove()

    await expect(stat(work.path)).rejects.toThrow('ENOENT')
    await expect(work.remove()).resolves.toBeUndefined()
  })

  it('keeps the directory among the live work directories until it is removed', async () => {
    let work = await createWorkDirectory()

    expect(LIVE_WORK_DIRECTORIES.has(work.path)).toBe(true)

    await work.remove()

    expect(LIVE_WORK_DIRECTORIES.has(work.path)).toBe(false)
  })
})
