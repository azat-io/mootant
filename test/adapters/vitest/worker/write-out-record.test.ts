import { readFile, mkdtemp, open, rm } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { writeOutRecord } from '../../../../adapters/vitest/worker/write-out-record'

describe('writeOutRecord', () => {
  it('appends one JSON line per record', async () => {
    let directory = await mkdtemp(path.join(tmpdir(), 'mootant-out-'))
    let file = path.join(directory, 'a-0.jsonl')
    let handle = await open(file, 'a')
    let first = { kind: 'late' as const, message: 'a', mutant: null, test: 't' }
    let second = { kind: 'late' as const, message: 'b', mutant: 'm', test: 't' }
    writeOutRecord(handle.fd, first)
    writeOutRecord(handle.fd, second)
    await handle.close()
    let lines = (await readFile(file, 'utf8')).split('\n')

    expect(
      lines.map(line => (line === '' ? null : (JSON.parse(line) as unknown))),
    ).toStrictEqual([first, second, null])

    await rm(directory, { recursive: true })
  })
})
