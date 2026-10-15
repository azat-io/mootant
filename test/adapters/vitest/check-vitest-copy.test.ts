import { writeFile, mkdtemp, mkdir, rm } from 'node:fs/promises'
import { describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'
import { realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { checkVitestCopy } from '../../../adapters/vitest/check-vitest-copy'
import { getRunnerPath } from '../../../adapters/vitest/get-runner-path'

vi.mock(import('node:module'), async importOriginal => {
  let actual = await importOriginal()
  return { ...actual, createRequire: vi.fn(actual.createRequire) }
})

describe('checkVitestCopy', () => {
  it('accepts the same copy', () => {
    expect(
      checkVitestCopy(
        path.resolve(import.meta.dirname, '../../fixtures/runner'),
        getRunnerPath(),
      ),
    ).toBeNull()
  })

  it('rejects another copy or none', async () => {
    let root = realpathSync(await mkdtemp(path.join(tmpdir(), 'mootant-copy-')))
    let copy = path.join(root, 'node_modules/vitest')
    await mkdir(copy, { recursive: true })
    await writeFile(path.join(copy, 'package.json'), '{"name":"vitest"}')
    let own = realpathSync(
      path.resolve(import.meta.dirname, '../../../node_modules/vitest'),
    )

    expect(checkVitestCopy(root, getRunnerPath())).toBe(
      `mootant and the project load different copies of Vitest (${own}, ${copy}); install mootant as a devDependency of the project.`,
    )

    vi.mocked(createRequire)
      .mockImplementationOnce(() => {
        throw new Error('Cannot find module')
      })
      .mockImplementationOnce(() => {
        throw new Error('Cannot find module')
      })

    expect(checkVitestCopy(root, getRunnerPath())).toBeNull()

    vi.mocked(createRequire).mockImplementationOnce(() => {
      throw new Error('Cannot find module')
    })

    expect(checkVitestCopy(root, getRunnerPath())).toContain(`(${own}, none)`)

    let actual = vi.mocked(createRequire).getMockImplementation()!
    vi.mocked(createRequire)
      .mockImplementationOnce(actual)
      .mockImplementationOnce(() => {
        throw new Error('Cannot find module')
      })

    expect(checkVitestCopy(root, getRunnerPath())).toContain(`(none, ${copy})`)

    await rm(root, { recursive: true })
  })
})
