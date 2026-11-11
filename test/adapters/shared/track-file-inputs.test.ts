import {
  writeFileSync,
  readFileSync,
  readdirSync,
  existsSync,
  mkdirSync,
} from 'node:fs'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { trackFileInputs } from '../../../adapters/shared/track-file-inputs'

describe('trackFileInputs', () => {
  let directory = ''

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'mootant-file-inputs-'))
  })

  afterEach(async () => {
    await rm(directory, { recursive: true })
  })

  /**
   * Gives the path of a file in the directory of the test.
   *
   * @param name - Path relative to the directory.
   * @returns Absolute path.
   */
  function file(name: string): string {
    return path.join(directory, name)
  }

  /**
   * Tells whether a path is in the directory of the test.
   *
   * @param read - Absolute path read.
   * @returns Whether it counts.
   */
  function accept(read: string): boolean {
    return read.startsWith(directory + path.sep)
  }

  it('counts the reads the filter accepts, a missing file included', () => {
    writeFileSync(file('b.json'), '')
    writeFileSync(file('a.json'), '')
    let tracking = trackFileInputs(accept)
    readFileSync(file('b.json'))
    readFileSync(file('a.json'))
    existsSync(file('missing.json'))
    existsSync(path.join(tmpdir(), 'mootant-outside-the-filter.json'))
    let live = [...tracking.files]
    let result = tracking.stop()

    expect(live).toStrictEqual([
      file('b.json'),
      file('a.json'),
      file('missing.json'),
    ])
    expect(result).toStrictEqual({
      files: [file('a.json'), file('b.json'), file('missing.json')],
      modified: [],
    })
  })

  it('leaves out a path the code wrote before it read it', () => {
    let tracking = trackFileInputs(accept)
    writeFileSync(file('own.json'), '{}')
    readFileSync(file('own.json'))

    expect(tracking.stop()).toStrictEqual({ modified: [], files: [] })
  })

  it('marks a path read before the code wrote it or its directory', () => {
    mkdirSync(file('folder'))
    let tracking = trackFileInputs(accept)
    existsSync(file('folder'))
    existsSync(file('changed.json'))
    existsSync(file('kept.json'))
    writeFileSync(file('changed.json'), '{}')
    writeFileSync(path.join(file('folder'), 'new.json'), '{}')

    expect(tracking.stop()).toStrictEqual({
      files: [file('changed.json'), file('folder'), file('kept.json')],
      modified: [file('changed.json'), file('folder')],
    })
  })

  it('counts a directory read after the code wrote a file in it', () => {
    mkdirSync(file('folder'))
    let tracking = trackFileInputs(accept)
    writeFileSync(file('folder/new.json'), '{}')
    readdirSync(file('folder'))

    expect(tracking.stop()).toStrictEqual({
      modified: [file('folder')],
      files: [file('folder')],
    })
  })

  it('marks a directory changed by a write the filter would not accept', () => {
    mkdirSync(file('folder'))
    let tracking = trackFileInputs(read => read === file('folder'))
    existsSync(file('folder'))
    writeFileSync(file('folder/new.json'), '{}')

    expect(tracking.stop()).toStrictEqual({
      modified: [file('folder')],
      files: [file('folder')],
    })
  })

  it('calls no function code replaced after this module loaded', () => {
    let tracking = trackFileInputs(accept)
    let dirname = vi.spyOn(path, 'dirname')
    writeFileSync(file('written.json'), '{}')
    let calls = dirname.mock.calls.length
    vi.restoreAllMocks()
    tracking.stop()

    expect(calls).toBe(0)
  })

  it('stops counting after stop', () => {
    let tracking = trackFileInputs(accept)
    existsSync(file('before.json'))
    tracking.stop()
    existsSync(file('after.json'))

    expect([...tracking.files]).toStrictEqual([file('before.json')])
  })
})
