import {
  writeFileSync,
  readFileSync,
  realpathSync,
  readdirSync,
  mkdtempSync,
  symlinkSync,
  existsSync,
  mkdirSync,
  cpSync,
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

  it('leaves out a directory mkdtemp made and the copies cp wrote, but not anything else in that directory or what a link leads to', () => {
    writeFileSync(file('fixture.json'), '{}')
    mkdirSync(file('kept'))
    mkdirSync(file('shared'))
    let tracking = trackFileInputs(accept)
    let temporary = mkdtempSync(file('temp-'))
    mkdirSync(file('made'))
    symlinkSync(file('shared'), file('made/link'))
    cpSync(file('fixture.json'), path.join(temporary, 'copy.json'))
    cpSync(file('fixture.json'), file('kept/copy.json'))
    for (let read of [
      temporary,
      path.join(temporary, 'copy.json'),
      path.join(temporary, 'missing.json'),
      file('made/link/data.json'),
      file('kept/copy.json'),
      file('kept/other.json'),
      file('beside.json'),
    ]) {
      existsSync(read)
    }

    expect(tracking.stop().files).toStrictEqual(
      [
        file('beside.json'),
        file('fixture.json'),
        file('kept/other.json'),
        file('made/link/data.json'),
        file('shared'),
        path.join(temporary, 'missing.json'),
      ].toSorted(),
    )
  })

  it('counts what a link in a directory mkdtemp made leads to, by the path through the link', () => {
    mkdirSync(file('shared'))
    writeFileSync(file('shared/limits.json'), '{}')
    let tracking = trackFileInputs(() => true)
    let temporary = mkdtempSync(file('temp-'))
    symlinkSync(file('shared'), path.join(temporary, 'link'))
    for (let read of [
      path.join(temporary, 'link/limits.json'),
      path.join(temporary, 'link/missing.json'),
    ]) {
      existsSync(read)
    }

    expect(tracking.stop().files).toStrictEqual(
      [
        file('shared'),
        path.join(temporary, 'link/limits.json'),
        path.join(temporary, 'link/missing.json'),
      ].toSorted(),
    )
  })

  it('counts a copy that cp made through a link it dereferenced, as its walk of the source does not enter the link', () => {
    mkdirSync(file('shared'))
    writeFileSync(file('shared/limits.json'), '{}')
    mkdirSync(file('source'))
    symlinkSync(file('shared'), file('source/link'))
    let tracking = trackFileInputs(accept)
    let temporary = mkdtempSync(file('temp-'))
    cpSync(file('source'), temporary, { dereference: true, recursive: true })
    readFileSync(path.join(temporary, 'link/limits.json'))

    expect(tracking.stop().files).toStrictEqual(
      [
        file('source'),
        file('source/link'),
        path.join(temporary, 'link/limits.json'),
      ].toSorted(),
    )
  })

  it('counts a copy of what cp copies but its walk of the source leaves out, such as .git', () => {
    mkdirSync(file('repository/.git'), { recursive: true })
    writeFileSync(file('repository/.git/HEAD'), 'ref: refs/heads/main\n')
    let tracking = trackFileInputs(accept)
    let temporary = mkdtempSync(file('temp-'))
    cpSync(file('repository'), temporary, { recursive: true })
    readFileSync(path.join(temporary, '.git/HEAD'))

    expect(tracking.stop().files).toStrictEqual(
      [file('repository'), path.join(temporary, '.git/HEAD')].toSorted(),
    )
  })

  it('keeps a directory that cp merged into an input, and the copies it wrote not', () => {
    mkdirSync(file('source/deep'), { recursive: true })
    writeFileSync(file('source/deep/a.txt'), 'a')
    mkdirSync(file('destination/deep'), { recursive: true })
    writeFileSync(file('destination/deep/extra.json'), '{}')
    let tracking = trackFileInputs(accept)
    cpSync(file('source'), file('destination'), { recursive: true })
    readdirSync(file('destination/deep'))
    readFileSync(file('destination/deep/a.txt'))

    expect(tracking.stop()).toStrictEqual({
      files: [
        file('destination/deep'),
        file('source'),
        file('source/deep'),
        file('source/deep/a.txt'),
      ],
      modified: [file('destination/deep')],
    })
  })

  it('leaves out a directory mkdtemp made by its real path too', () => {
    mkdirSync(file('real-parent'))
    symlinkSync(file('real-parent'), file('link-parent'))
    let tracking = trackFileInputs(() => true)
    let temporary = mkdtempSync(path.join(file('link-parent'), 'temp-'))
    readdirSync(realpathSync(temporary))
    readdirSync(temporary)

    expect(tracking.stop().files).toStrictEqual([])
  })

  it('tells whether the code wrote a path itself, also after it stopped', () => {
    let tracking = trackFileInputs(accept)
    let temporary = mkdtempSync(file('temp-'))
    writeFileSync(file('written.json'), '{}')
    tracking.stop()

    expect(
      [
        file('written.json'),
        temporary,
        realpathSync(temporary),
        path.join(temporary, 'helper.js'),
        file('other.js'),
      ].map(entry => tracking.owns(entry)),
    ).toStrictEqual([true, true, true, false, false])
  })

  it('counts a copy of a relative link that cp keeps as it is, which may lead elsewhere than the link it copies', () => {
    writeFileSync(file('limits.json'), '{}')
    mkdirSync(file('other'))
    writeFileSync(file('other/limits.json'), '{}')
    mkdirSync(file('source'))
    symlinkSync('../limits.json', file('source/link'))
    let tracking = trackFileInputs(accept)
    cpSync(file('source'), file('other/copy'), {
      verbatimSymlinks: true,
      recursive: true,
    })
    readFileSync(file('other/copy/link'))

    expect(tracking.stop().files).toStrictEqual([
      file('other/copy/link'),
      file('source'),
      file('source/link'),
    ])
  })

  it('takes a path the code wrote by the real path of its directory too, as require names a module', () => {
    mkdirSync(file('real'))
    symlinkSync(file('real'), file('link'))
    let tracking = trackFileInputs(() => true)
    writeFileSync(file('link/helper.js'), '')
    expect(() => {
      writeFileSync(file('missing/helper.js'), '')
    }).toThrow()
    let canonical = realpathSync(file('link/helper.js'))
    readFileSync(canonical)
    tracking.stop()

    expect(canonical).not.toBe(file('link/helper.js'))
    expect(
      [canonical, file('link/helper.js'), file('missing/helper.js')].map(
        entry => tracking.owns(entry),
      ),
    ).toStrictEqual([true, true, true])
    expect([...tracking.files]).toStrictEqual([])
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
