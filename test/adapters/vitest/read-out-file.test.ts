import { writeFile, mkdtemp, rm } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { readOutFile } from '../../../adapters/vitest/read-out-file'

describe('readOutFile', () => {
  it('reads the records of an out file and skips a cut line', async () => {
    let directory = await mkdtemp(path.join(tmpdir(), 'mootant-out-'))
    let file = path.join(directory, 'a-0.jsonl')
    await writeFile(
      file,
      '{"kind":"late","message":"x","mutant":null,"test":"t"}\n{"kind":',
    )

    expect(readOutFile(file)).toStrictEqual([
      { kind: 'late', message: 'x', mutant: null, test: 't' },
    ])

    await rm(directory, { recursive: true })
  })
})
