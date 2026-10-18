import { writeFile, mkdtemp, mkdir, rm } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { getPreloadPath } from '../../../adapters/node-test/get-preload-path'

describe('getPreloadPath', () => {
  it('finds the source preload next to the adapter', () => {
    expect(getPreloadPath()).toBe(
      path.resolve(
        import.meta.dirname,
        '../../../adapters/node-test/preload/preload.ts',
      ),
    )
  })

  it('prefers the built preload', async () => {
    let directory = await mkdtemp(path.join(tmpdir(), 'mootant-dist-'))
    await mkdir(path.join(directory, 'preload'))
    await writeFile(path.join(directory, 'preload', 'preload.js'), '')

    expect(getPreloadPath(directory)).toBe(
      path.join(directory, 'preload', 'preload.js'),
    )

    await rm(directory, { recursive: true })
  })
})
