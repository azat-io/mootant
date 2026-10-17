import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { writeFile, mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { findLockfile } from '../../../core/cache/find-lockfile'

/**
 * Directory with the projects of the tests.
 */
let directory = ''

describe('findLockfile', () => {
  beforeAll(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'mootant-lock-'))
    await mkdir(path.join(directory, 'workspace/packages/app'), {
      recursive: true,
    })
    await writeFile(path.join(directory, 'workspace/yarn.lock'), '')
    await writeFile(path.join(directory, 'workspace/package-lock.json'), '')
  })

  afterAll(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('finds the first lockfile in the root or above it', () => {
    expect(findLockfile(path.join(directory, 'workspace/packages/app'))).toBe(
      path.join(directory, 'workspace/package-lock.json'),
    )
    expect(findLockfile(path.join(directory, 'workspace'))).toBe(
      path.join(directory, 'workspace/package-lock.json'),
    )
  })

  it('gives null without a lockfile up to the file system root', () => {
    expect(findLockfile(path.parse(directory).root)).toBeNull()
  })
})
