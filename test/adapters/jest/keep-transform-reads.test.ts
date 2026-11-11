import {
  writeFile,
  readFile,
  mkdtemp,
  utimes,
  mkdir,
  rm,
} from 'node:fs/promises'
import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { keepTransformReads } from '../../../adapters/jest/keep-transform-reads'

/**
 * Directory of the current test.
 */
let directory = ''

/**
 * Project root of the current test.
 */
let root = ''

/**
 * Cache directory of the current test.
 */
let cache = ''

/**
 * Start of the session of the current test.
 */
let started = 0

/**
 * Writes what the file of the cache keeps, as an earlier session left it.
 *
 * @param paths - Paths relative to the root.
 */
async function writeKept(paths: string[]): Promise<void> {
  await mkdir(cache, { recursive: true })
  await writeFile(
    path.join(cache, 'transform-reads.json'),
    `${JSON.stringify(paths)}\n`,
  )
}

/**
 * Reads what the file of the cache keeps.
 *
 * @returns Its paths.
 */
async function readKept(): Promise<unknown> {
  return JSON.parse(
    await readFile(path.join(cache, 'transform-reads.json'), 'utf8'),
  )
}

describe('keepTransformReads', () => {
  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'mootant-reads-'))
    root = path.join(directory, 'project')
    cache = path.join(root, 'node_modules/.cache/mootant/jest')
    await mkdir(root)
    started = Date.now()
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('joins the reads with those earlier sessions kept, and keeps the join by paths relative to the root, sorted', () => {
    keepTransformReads({
      reads: new Set([path.join(root, 'tsconfig.json')]),
      directory: cache,
      started,
      root,
    })
    let joined = keepTransformReads({
      reads: new Set([
        path.join(root, 'tsconfig.json'),
        path.join(root, 'test'),
      ]),
      directory: cache,
      started,
      root,
    })

    expect(joined).toStrictEqual(
      new Set([path.join(root, 'tsconfig.json'), path.join(root, 'test')]),
    )
    expect(
      keepTransformReads({ directory: cache, reads: new Set(), started, root }),
    ).toStrictEqual(joined)
  })

  it('writes the paths relative to the root, a path outside it with its way up', async () => {
    await mkdir(path.join(directory, 'shared'))
    keepTransformReads({
      reads: new Set([
        path.join(directory, 'shared/tsconfig.base.json'),
        path.join(root, '.babelrc'),
        path.join(root, 'test'),
      ]),
      directory: cache,
      started,
      root,
    })

    await expect(readKept()).resolves.toStrictEqual([
      '../shared/tsconfig.base.json',
      '.babelrc',
      'test',
    ])
  })

  it('leaves out a path of an earlier session that this one did not read and that changed since it started, which stays in the file', async () => {
    let tsconfig = path.join(root, 'tsconfig.json')
    let source = path.join(root, 'src')
    let changed = path.join(root, 'test')
    await mkdir(changed)
    await mkdir(source)
    await writeFile(tsconfig, '{}\n')
    let long = new Date('2000-01-01')
    // Linux stamps files by a coarse clock, which can be behind Date.now().
    let late = new Date(started + 1000)
    await utimes(source, long, long)
    await utimes(changed, late, late)
    await writeKept(['src', 'test', 'tsconfig.json'])

    expect(
      keepTransformReads({
        reads: new Set([tsconfig]),
        directory: cache,
        started,
        root,
      }),
    ).toStrictEqual(new Set([tsconfig, source]))
    await expect(readKept()).resolves.toStrictEqual([
      'src',
      'test',
      'tsconfig.json',
    ])
  })

  it('drops the paths whose directory is gone, from the file too, as probes in a directory made for one run would pile up', async () => {
    await mkdir(path.join(root, 'test'))
    await writeKept(['out-1/.babelrc', 'test/.babelrc'])

    expect(
      keepTransformReads({
        reads: new Set([path.join(root, 'out-2/.babelrc')]),
        directory: cache,
        started,
        root,
      }),
    ).toStrictEqual(new Set([path.join(root, 'test/.babelrc')]))
    await expect(readKept()).resolves.toStrictEqual(['test/.babelrc'])
  })

  it.each([
    ['holds no JSON', 'not json'],
    ['holds no list', '{ "test": true }\n'],
  ])(
    'starts from the reads alone when the file %s, and writes over it',
    async (_name, text) => {
      await mkdir(cache, { recursive: true })
      await writeFile(path.join(cache, 'transform-reads.json'), text)
      let joined = keepTransformReads({
        reads: new Set([path.join(root, 'test')]),
        directory: cache,
        started,
        root,
      })

      expect(joined).toStrictEqual(new Set([path.join(root, 'test')]))
      await expect(readKept()).resolves.toStrictEqual(['test'])
    },
  )

  it('leaves out what is no path in a list the file holds', async () => {
    await mkdir(cache, { recursive: true })
    await writeFile(
      path.join(cache, 'transform-reads.json'),
      '["test", 1, null]\n',
    )

    expect(
      keepTransformReads({ directory: cache, reads: new Set(), started, root }),
    ).toStrictEqual(new Set([path.join(root, 'test')]))
  })

  it('gives the join when the file cannot be written, as it only spares runs', async () => {
    await mkdir(path.dirname(cache), { recursive: true })
    await writeFile(cache, 'a file where the directory goes')

    expect(
      keepTransformReads({
        reads: new Set([path.join(root, 'test')]),
        directory: cache,
        started,
        root,
      }),
    ).toStrictEqual(new Set([path.join(root, 'test')]))
  })
})
