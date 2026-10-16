import { writeFile, mkdtemp, readdir, mkdir, rm } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { resetRunDirectory } from '../../../adapters/vitest/reset-run-directory'

describe('resetRunDirectory', () => {
  it('empties the folders of a run', async () => {
    let directory = await mkdtemp(path.join(tmpdir(), 'mootant-reset-'))
    await mkdir(path.join(directory, 'out'))
    await writeFile(path.join(directory, 'out', 'a-0.jsonl'), '{}')
    await writeFile(path.join(directory, 'keep.txt'), '')
    resetRunDirectory(directory)

    expect((await readdir(directory)).toSorted()).toStrictEqual([
      'beat',
      'claim',
      'done',
      'keep.txt',
      'out',
      'plan',
      'worker',
    ])
    await expect(readdir(path.join(directory, 'out'))).resolves.toStrictEqual(
      [],
    )

    await rm(directory, { recursive: true })
  })
})
