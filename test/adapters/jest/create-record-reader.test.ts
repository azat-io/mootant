import {
  appendFileSync,
  writeFileSync,
  mkdtempSync,
  closeSync,
  writeSync,
  openSync,
  rmSync,
} from 'node:fs'
import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { createRecordReader } from '../../../adapters/jest/create-record-reader'

/**
 * Temporary directory of the current test.
 */
let directory = ''

/**
 * Out file of the current test, which starts empty.
 */
let out = ''

describe('createRecordReader', () => {
  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'mootant-reader-'))
    out = path.join(directory, 'out.jsonl')
    writeFileSync(out, '')
  })

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true })
  })

  it('reads no records from an empty file', () => {
    let reader = createRecordReader(out)

    expect(reader.read()).toStrictEqual([])

    reader.close()
  })

  it('keeps the records so far and adds what was appended', () => {
    let reader = createRecordReader(out)
    appendFileSync(out, '{"kind":"start","time":1}\n')

    expect(reader.read()).toStrictEqual([{ kind: 'start', time: 1 }])

    appendFileSync(out, '{"kind":"concurrent","time":2}\n')

    expect(reader.read()).toStrictEqual([
      { kind: 'start', time: 1 },
      { kind: 'concurrent', time: 2 },
    ])
    expect(reader.read()).toHaveLength(2)

    reader.close()
  })

  it('parses only what was appended', () => {
    let reader = createRecordReader(out)
    appendFileSync(out, '{"kind":"start","time":1}\n')
    reader.read()
    let descriptor = openSync(out, 'r+')
    writeSync(descriptor, 'not a record, not a record', 0)
    closeSync(descriptor)
    appendFileSync(out, '{"kind":"concurrent","time":2}\n')

    expect(reader.read()).toStrictEqual([
      { kind: 'start', time: 1 },
      { kind: 'concurrent', time: 2 },
    ])

    reader.close()
  })

  it('holds a torn last line back and reads it once whole', () => {
    let reader = createRecordReader(out)
    appendFileSync(out, '{"kind":"start","time":1}\n{"kind":"')

    expect(reader.read()).toStrictEqual([{ kind: 'start', time: 1 }])
    expect(reader.read()).toStrictEqual([{ kind: 'start', time: 1 }])

    appendFileSync(out, 'concurrent","time":2}\n')

    expect(reader.read()).toStrictEqual([
      { kind: 'start', time: 1 },
      { kind: 'concurrent', time: 2 },
    ])
    expect(reader.read()).toHaveLength(2)

    reader.close()
  })

  it('reads a line torn inside a character whole', () => {
    let line = Buffer.from('{"kind":"stale","message":"€","time":1}\n')
    let cut = line.indexOf('€') + 1
    let reader = createRecordReader(out)
    appendFileSync(out, line.subarray(0, cut))

    expect(reader.read()).toStrictEqual([])

    appendFileSync(out, line.subarray(cut))

    expect(reader.read()).toStrictEqual([
      { kind: 'stale', message: '€', time: 1 },
    ])

    reader.close()
  })

  it('moves on by bytes, so a line after long text is not read twice', () => {
    let message = '€'.repeat(30)
    let reader = createRecordReader(out)
    appendFileSync(
      out,
      `{"kind":"stale","message":"${message}","time":1}\n{"kind":"start","time":2}\n`,
    )
    reader.read()
    appendFileSync(out, '{"kind":"concurrent","time":3}\n')

    expect(reader.read().map(record => record.time)).toStrictEqual([1, 2, 3])

    reader.close()
  })

  it('leaves out a whole line that is not JSON', () => {
    let reader = createRecordReader(out)
    appendFileSync(out, '{"kind":"sta\n{"kind":"start","time":1}\n')

    expect(reader.read()).toStrictEqual([{ kind: 'start', time: 1 }])

    reader.close()
  })

  it('still reads the file once it was removed', () => {
    let reader = createRecordReader(out)
    let descriptor = openSync(out, 'a')
    rmSync(directory, { recursive: true })
    writeSync(descriptor, '{"kind":"start","time":1}\n')
    closeSync(descriptor)

    expect(reader.read()).toStrictEqual([{ kind: 'start', time: 1 }])

    reader.close()
  })

  it('closes the file, which no later read gets through', () => {
    let reader = createRecordReader(out)
    reader.close()

    expect(() => reader.read()).toThrow(/EBADF/u)
  })

  it('throws when the file does not open', () => {
    expect(() => createRecordReader(path.join(directory, 'no'))).toThrow(
      /ENOENT/u,
    )
  })
})
