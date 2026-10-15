import { writeFile, mkdtemp, mkdir, rm } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { readOutFiles } from '../../../adapters/vitest/read-out-files'

describe('readOutFiles', () => {
  it('reads the records of every out file and skips cut lines', async () => {
    let directory = await mkdtemp(path.join(tmpdir(), 'mootant-read-'))
    await mkdir(path.join(directory, 'out'))
    let late = { message: 'a', mutant: null, kind: 'late', test: 't' }
    await writeFile(
      path.join(directory, 'out', 'b-0.jsonl'),
      `${JSON.stringify(late)}\n{"kind":`,
    )
    await writeFile(path.join(directory, 'out', 'a-1.jsonl'), '')

    expect(readOutFiles(directory)).toStrictEqual(
      new Map([
        ['b-0', [late]],
        ['a-1', []],
      ]),
    )

    await rm(directory, { recursive: true })
  })
})
