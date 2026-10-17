import { writeFile, realpath, mkdtemp, utimes, rm } from 'node:fs/promises'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { findChangedFiles } from '../../../core/cache/find-changed-files'

/**
 * Real path of the temporary directory of the tests.
 */
let root = ''

describe('findChangedFiles', () => {
  beforeAll(async () => {
    root = await realpath(await mkdtemp(path.join(tmpdir(), 'mootant-chg-')))
  })

  afterAll(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('finds files modified at or after a moment, in chunks', async () => {
    let names = Array.from({ length: 70 }, (_value, index) => `${index}.ts`)
    await Promise.all(
      names.map(async (name, index) => {
        let file = path.join(root, name)
        await writeFile(file, name)
        let time = new Date(index % 2 === 0 ? 1_000_000 : 3_000_000)
        await utimes(file, time, time)
      }),
    )
    let files = names.map(name => path.join(root, name))

    let changed = await findChangedFiles(
      [...files, files[1]!, path.join(root, 'missing.ts')],
      2_000_000,
    )

    expect([...changed].toSorted()).toStrictEqual(
      files.filter((_file, index) => index % 2 === 1).toSorted(),
    )
  })
})
