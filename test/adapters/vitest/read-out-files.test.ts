import { writeFile, mkdtemp, mkdir, rm } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { encodeStray } from '../../../adapters/vitest/worker/encode-stray'
import { readOutFiles } from '../../../adapters/vitest/read-out-files'

describe('readOutFiles', () => {
  it('reads the records of every out file and skips cut lines', async () => {
    let directory = await mkdtemp(path.join(tmpdir(), 'mootant-read-'))
    await mkdir(path.join(directory, 'out'))
    let late = { mutant: null, kind: 'late', test: 't' }
    await writeFile(
      path.join(directory, 'out', 'b-0.jsonl'),
      `${JSON.stringify({ ...late, stray: encodeStray('a', 'Unhandled Rejection', 0) })}\n{"kind":`,
    )
    await writeFile(path.join(directory, 'out', 'a-1.jsonl'), '')
    let vitest = {
      config: { dangerouslyIgnoreUnhandledErrors: false },
      state: {},
    } as never

    expect(readOutFiles(vitest, directory, new Map())).toStrictEqual(
      new Map([
        ['b-0', [{ ...late, message: 'a' }]],
        ['a-1', []],
      ]),
    )

    await rm(directory, { recursive: true })
  })
})
