import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import { readFile, mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { claimUnit } from '../../../../adapters/vitest/worker/claim-unit'

describe('claimUnit', () => {
  let directory: string

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'mootant-claim-'))
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('claims each unit of a file once', async () => {
    await mkdir(path.join(directory, 'claim'))

    expect(claimUnit(directory, 'aaaa', 2)).toBe(0)
    expect(claimUnit(directory, 'aaaa', 2)).toBe(1)
    expect(claimUnit(directory, 'aaaa', 2)).toBeNull()
    expect(claimUnit(directory, 'bbbb', 1)).toBe(0)
    await expect(
      readFile(path.join(directory, 'claim', 'aaaa-1'), 'utf8'),
    ).resolves.toBe(String(process.pid))
  })

  it('throws when the claim folder is missing', () => {
    expect(() => claimUnit(directory, 'aaaa', 1)).toThrow('ENOENT')
  })
})
