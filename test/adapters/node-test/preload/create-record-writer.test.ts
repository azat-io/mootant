import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { createRecordWriter } from '../../../../adapters/node-test/preload/create-record-writer'

describe('createRecordWriter', () => {
  it('appends one JSON line per record to the out file', async () => {
    let directory = await mkdtemp(path.join(tmpdir(), 'mootant-records-'))
    let file = path.join(directory, 'out.jsonl')
    let write = createRecordWriter(file)
    let other = createRecordWriter(file)
    write({ kind: 'loaded' })
    other({ kind: 'close', seq: 1 })
    write({ file: '/a.js', kind: 'load' })
    let lines = (await readFile(file, 'utf8')).split('\n')

    expect(
      lines.map(line => (line === '' ? null : (JSON.parse(line) as unknown))),
    ).toStrictEqual([
      { kind: 'loaded' },
      { kind: 'close', seq: 1 },
      { file: '/a.js', kind: 'load' },
      null,
    ])

    await rm(directory, { recursive: true })
  })
})
