import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { syncBuiltinESMExports } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import fs from 'node:fs'

import type { JestRecord } from '../../../../adapters/jest/types/jest-record'
import type { JestUnit } from '../../../../adapters/jest/types/jest-unit'
import type { VmSide } from '../../../../adapters/jest/types/vm-side'

import { createWorkerChannel } from '../../../../adapters/jest/worker/create-worker-channel'

/**
 * Temporary directory of the current test.
 */
let directory = ''

/**
 * Loads a copy of the module while `fs` holds spies, so the copy captures them
 * the way the bundle captures what a test's spy later cannot reach.
 *
 * @returns The function of the copy and the spies it writes and closes through.
 */
async function loadWithSpies(): Promise<{
  writeSync: ReturnType<typeof vi.fn>
  closeSync: ReturnType<typeof vi.fn>
  create: typeof createWorkerChannel
}> {
  let writeSync = vi.spyOn(fs, 'writeSync')
  let closeSync = vi.spyOn(fs, 'closeSync')
  syncBuiltinESMExports()
  vi.resetModules()
  let { createWorkerChannel: create } =
    await import('../../../../adapters/jest/worker/create-worker-channel')
  return {
    closeSync: closeSync as never,
    writeSync: writeSync as never,
    create,
  }
}

/**
 * Reads the kinds of the records of an out file.
 *
 * @param name - Name of the out file.
 * @returns The kind of each line.
 */
async function readKinds(name: string): Promise<string[]> {
  let text = await readFile(path.join(directory, name), 'utf8')
  return text
    .split('\n')
    .filter(line => line !== '')
    .map(line => (JSON.parse(line) as JestRecord).kind)
}

/**
 * Creates a unit whose out file lies in the directory of the test.
 *
 * @param name - Name of the out file.
 * @returns A dry unit.
 */
function createUnit(name: string): JestUnit {
  return {
    out: path.join(directory, name),
    file: '/a.test.js',
    console: 'buffer',
    project: 'p',
    mutant: null,
    plan: null,
  }
}

/**
 * Gives a write that fails the way one does while `mock-fs` holds the binding.
 *
 * @throws {Error} Always.
 */
function fail(): never {
  throw new Error('the binding is gone')
}

describe('createWorkerChannel', () => {
  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'mootant-channel-'))
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    syncBuiltinESMExports()
    await rm(directory, { recursive: true, force: true })
  })

  it('raises the token, keeps the unit, forgets the side and writes start', async () => {
    let channel = createWorkerChannel()
    channel.vm = {} as VmSide
    let unit = createUnit('a.jsonl')

    expect(channel.begin(unit)).toBe(1)
    expect(channel.token).toBe(1)
    expect(channel.unit).toBe(unit)
    expect(channel.vm).toBeNull()
    expect(channel.enterEnvironment()).toBeUndefined()

    channel.end()

    await expect(readKinds('a.jsonl')).resolves.toStrictEqual(['start'])
  })

  it('appends to an out file that has lines', async () => {
    let channel = createWorkerChannel()
    channel.begin(createUnit('a.jsonl'))
    channel.end()
    channel.begin(createUnit('a.jsonl'))
    channel.end()

    await expect(readKinds('a.jsonl')).resolves.toStrictEqual([
      'start',
      'start',
    ])
  })

  it('stamps every line with the time and keeps the fields of the record', async () => {
    let before = Date.now()
    let channel = createWorkerChannel()
    let token = channel.begin(createUnit('a.jsonl'))
    channel.write(token, { kind: 'reached', hits: 3 })
    channel.end()
    let text = await readFile(path.join(directory, 'a.jsonl'), 'utf8')
    let [, line] = text.split('\n', 2)
    let record = JSON.parse(line!) as { time: number; hits: number }

    expect(record).toStrictEqual({
      time: expect.any(Number) as number,
      kind: 'reached',
      hits: 3,
    })
    expect(record.time).toBeGreaterThanOrEqual(before)
  })

  it('throws when the out file does not open, and has no file open then', async () => {
    let channel = createWorkerChannel()
    let token = 0

    expect(() => {
      token = channel.begin(createUnit('missing/a.jsonl'))
    }).toThrow(/ENOENT/u)
    expect(() => {
      channel.write(token, { kind: 'concurrent' })
      channel.end()
    }).not.toThrow()

    let next = channel.begin(createUnit('a.jsonl'))
    channel.end()

    expect(next).toBe(2)
    await expect(readKinds('a.jsonl')).resolves.toStrictEqual(['start'])
  })

  it('writes nothing for an old token', async () => {
    let channel = createWorkerChannel()
    let old = channel.begin(createUnit('a.jsonl'))
    channel.end()
    let token = channel.begin(createUnit('b.jsonl'))
    channel.write(old, { kind: 'concurrent' })
    channel.write(token, { kind: 'beat', timeout: 1 })
    channel.end()

    await expect(readKinds('a.jsonl')).resolves.toStrictEqual(['start'])
    await expect(readKinds('b.jsonl')).resolves.toStrictEqual(['start', 'beat'])
  })

  it('writes nothing after the end, even with the current token', async () => {
    let channel = createWorkerChannel()
    let token = channel.begin(createUnit('a.jsonl'))
    channel.end()
    channel.write(token, { kind: 'concurrent' })
    channel.end()

    await expect(readKinds('a.jsonl')).resolves.toStrictEqual(['start'])
  })

  it('drops a record that cannot become JSON and goes on', async () => {
    let channel = createWorkerChannel()
    let token = channel.begin(createUnit('a.jsonl'))

    expect(() => {
      channel.write(token, { kind: 'beat', timeout: 1n } as never)
    }).not.toThrow()

    channel.write(token, { kind: 'concurrent' })
    channel.end()

    await expect(readKinds('a.jsonl')).resolves.toStrictEqual([
      'start',
      'concurrent',
    ])
  })

  it('keeps lines a failing write left, in order, for the next write', async () => {
    let { writeSync, create } = await loadWithSpies()
    let channel = create()
    let token = channel.begin(createUnit('a.jsonl'))
    writeSync.mockImplementationOnce(fail)
    writeSync.mockImplementationOnce(fail)

    expect(() => {
      channel.write(token, { kind: 'beat', timeout: 1 })
      channel.write(token, { kind: 'concurrent' })
    }).not.toThrow()
    await expect(readKinds('a.jsonl')).resolves.toStrictEqual(['start'])

    channel.write(token, { kind: 'reached', hits: 1 })

    await expect(readKinds('a.jsonl')).resolves.toStrictEqual([
      'start',
      'beat',
      'concurrent',
      'reached',
    ])

    channel.end()
  })

  it('flushes at the end what a failing write left', async () => {
    let { writeSync, create } = await loadWithSpies()
    let channel = create()
    let token = channel.begin(createUnit('a.jsonl'))
    writeSync.mockImplementationOnce(fail)
    channel.write(token, { kind: 'concurrent' })
    channel.end()

    await expect(readKinds('a.jsonl')).resolves.toStrictEqual([
      'start',
      'concurrent',
    ])
  })

  it('does not throw when the end cannot flush, and no lost line reaches the next unit', async () => {
    let { writeSync, create } = await loadWithSpies()
    let channel = create()
    let token = channel.begin(createUnit('a.jsonl'))
    writeSync.mockImplementationOnce(fail)
    channel.write(token, { kind: 'concurrent' })
    writeSync.mockImplementationOnce(fail)

    expect(() => {
      channel.end()
    }).not.toThrow()

    channel.begin(createUnit('b.jsonl'))
    channel.end()

    await expect(readKinds('a.jsonl')).resolves.toStrictEqual(['start'])
    await expect(readKinds('b.jsonl')).resolves.toStrictEqual(['start'])
  })

  it('does not throw when closing fails, and leaves no file open', async () => {
    let { closeSync, create } = await loadWithSpies()
    let channel = create()
    let token = channel.begin(createUnit('a.jsonl'))
    closeSync.mockImplementationOnce(fail)

    expect(() => {
      channel.end()
    }).not.toThrow()

    channel.write(token, { kind: 'concurrent' })

    await expect(readKinds('a.jsonl')).resolves.toStrictEqual(['start'])
  })

  it('uses the writeSync and the clock of load time, whatever a test spies on later', async () => {
    let channel = createWorkerChannel()
    let token = channel.begin(createUnit('a.jsonl'))
    let writeSync = vi.spyOn(fs, 'writeSync')
    let closeSync = vi.spyOn(fs, 'closeSync')
    let now = vi.spyOn(Date, 'now').mockReturnValue(1)
    syncBuiltinESMExports()
    channel.write(token, { kind: 'concurrent' })
    channel.end()

    expect(writeSync).not.toHaveBeenCalled()
    expect(closeSync).not.toHaveBeenCalled()
    expect(now).not.toHaveBeenCalled()

    vi.restoreAllMocks()
    syncBuiltinESMExports()

    await expect(readKinds('a.jsonl')).resolves.toStrictEqual([
      'start',
      'concurrent',
    ])
  })
})
