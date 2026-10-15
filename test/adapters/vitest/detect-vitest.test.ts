import { writeFile, mkdtemp, mkdir, rm } from 'node:fs/promises'
import { describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { detectVitest } from '../../../adapters/vitest/detect-vitest'

vi.mock(import('node:module'), async importOriginal => {
  let actual = await importOriginal()
  return { ...actual, createRequire: vi.fn(actual.createRequire) }
})

describe('detectVitest', () => {
  it('finds Vitest 5 of the project', async () => {
    let root = path.resolve(import.meta.dirname, '../../..')
    let detection = await detectVitest(root)

    expect(detection).toStrictEqual({
      node: createRequire(path.join(root, 'package.json')).resolve(
        'vitest/node',
      ),
      version: expect.stringMatching(/^5\./u) as string,
      available: true,
    })
  })

  it('reports a missing or unsupported Vitest', async () => {
    let root = await mkdtemp(path.join(tmpdir(), 'mootant-detect-'))
    vi.mocked(createRequire).mockReturnValueOnce({
      resolve: () => {
        throw new Error('Cannot find module')
      },
    } as never)

    await expect(detectVitest(root)).resolves.toStrictEqual({
      available: false,
      version: null,
      node: null,
    })

    await mkdir(path.join(root, 'node_modules/vitest'), { recursive: true })
    await writeFile(
      path.join(root, 'node_modules/vitest/package.json'),
      '{"name":"vitest","version":"4.1.0"}',
    )

    await expect(detectVitest(root)).resolves.toStrictEqual({
      available: false,
      version: '4.1.0',
      node: null,
    })

    await rm(root, { recursive: true })
  })
})
