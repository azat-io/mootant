import { writeFile, mkdtemp, mkdir, rm } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { readEnvironmentHashes } from '../../../adapters/vitest/read-environment-hashes'

describe('readEnvironmentHashes', () => {
  it('reads the hashes of every project and skips cut-off files', async () => {
    let directory = await mkdtemp(path.join(tmpdir(), 'mootant-env-'))
    await mkdir(path.join(directory, 'env'))
    await writeFile(
      path.join(directory, 'env', 'a.json'),
      JSON.stringify({ variables: { MODE: 'h1' }, project: '' }),
    )
    await writeFile(
      path.join(directory, 'env', 'b.json'),
      JSON.stringify({ variables: { MODE: 'h2' }, project: 'web' }),
    )
    await writeFile(path.join(directory, 'env', 'c.json'), '{"variables": {')

    expect(readEnvironmentHashes(directory)).toStrictEqual({
      web: { MODE: 'h2' },
      '': { MODE: 'h1' },
    })

    await rm(directory, { recursive: true })
  })
})
