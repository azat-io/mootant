import { readFile, mkdtemp, open, rm } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { writeHeartbeat } from '../../../../adapters/vitest/worker/write-heartbeat'

describe('writeHeartbeat', () => {
  it('overwrites the heartbeat file in place', async () => {
    let directory = await mkdtemp(path.join(tmpdir(), 'mootant-beat-'))
    let file = path.join(directory, '1.json')
    let handle = await open(file, 'w')
    let beat = {
      name: 'suite > test',
      file: '/a.test.ts',
      mutant: 'abcdef',
      test: 'abc_0_1',
      sequence: 1,
      budget: 10,
      unit: 0,
      pid: 1,
    }
    let length = writeHeartbeat(handle.fd, beat, 0)
    let shorter = {
      ...beat,
      mutant: null,
      sequence: 2,
      name: null,
      test: null,
    }
    let next = writeHeartbeat(handle.fd, shorter, length)
    await handle.close()
    let text = await readFile(file, 'utf8')

    expect(length).toBe(JSON.stringify(beat).length)
    expect(next).toBe(length)
    expect(text).toHaveLength(length)
    expect(JSON.parse(text)).toStrictEqual(shorter)

    await rm(directory, { recursive: true })
  })
})
