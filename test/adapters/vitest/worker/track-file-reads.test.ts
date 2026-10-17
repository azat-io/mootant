import fs, {
  createWriteStream,
  createReadStream,
  writeFileSync,
  readFileSync,
  symlinkSync,
  renameSync,
  unlinkSync,
  existsSync,
  mkdirSync,
  rmdirSync,
  closeSync,
  linkSync,
  openSync,
  statSync,
  cpSync,
  rmSync,
} from 'node:fs'
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest'
import { readFile, readdir, mkdtemp, rm } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { trackFileReads } from '../../../../adapters/vitest/worker/track-file-reads'

/**
 * Directory with the files of the tests.
 */
let directory = ''

/**
 * Creates a directory tree in the directory of the tests: a file, a directory
 * with a directory and a file in it, a `node_modules` directory with a package
 * and a link to a directory.
 *
 * @param name - Name of the tree's directory.
 * @returns Absolute path of the tree.
 */
function createTree(name: string): string {
  let tree = path.join(directory, name)
  mkdirSync(path.join(tree, 'sub/deep'), { recursive: true })
  mkdirSync(path.join(tree, 'node_modules/package'), { recursive: true })
  writeFileSync(path.join(tree, 'a.txt'), '')
  writeFileSync(path.join(tree, 'sub/deep/b.txt'), '')
  symlinkSync(path.join(tree, 'sub'), path.join(tree, 'link'))
  return tree
}

/**
 * Starts recording into fresh lists.
 *
 * @returns Paths read and written.
 */
function record(): { written: string[]; read: string[] } {
  let paths = { written: [] as string[], read: [] as string[] }
  trackFileReads({
    write: file => {
      paths.written.push(path.relative(directory, file))
    },
    read: file => {
      paths.read.push(path.relative(directory, file))
    },
  })
  return paths
}

describe('trackFileReads', () => {
  beforeAll(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'mootant-reads-'))
  })

  afterAll(async () => {
    trackFileReads(null)
    await rm(directory, { recursive: true, force: true })
  })

  it('reports files read through every form of node:fs', async () => {
    let paths = record()
    writeFileSync(path.join(directory, 'a.json'), '{}')

    expect(readFileSync(path.join(directory, 'a.json'), 'utf8')).toBe('{}')
    await expect(
      readFile(path.join(directory, 'a.json'), 'utf8'),
    ).resolves.toBe('{}')
    await expect(
      fs.promises.readdir(pathToFileURL(directory)),
    ).resolves.toContain('a.json')
    await expect(readdir(directory)).resolves.toContain('a.json')
    await expect(
      fs.promises.access(path.join(directory, 'missing.json')),
    ).rejects.toThrow()
    expect(existsSync(Buffer.from(path.join(directory, 'b.json')))).toBe(false)
    expect(statSync(path.join(directory, 'a.json')).isFile()).toBe(true)
    await expect(
      fs.promises.lstat(path.join(directory, 'a.json')),
    ).resolves.toBeDefined()
    closeSync(
      (openSync as (file: string) => number)(path.join(directory, 'a.json')),
    )
    closeSync(openSync(path.join(directory, 'a.json'), 'r+'))
    closeSync(openSync(path.join(directory, 'a.json'), fs.constants.O_RDONLY))
    closeSync(openSync(path.join(directory, 'w.json'), 'w'))
    closeSync(
      openSync(
        path.join(directory, 'n.json'),
        fs.constants.O_CREAT | fs.constants.O_WRONLY,
      ),
    )
    await new Promise(resolve => {
      createReadStream(path.join(directory, 'a.json'))
        .on('close', resolve)
        .resume()
    })
    await new Promise<void>(resolve => {
      createWriteStream(path.join(directory, 's.json')).end(() => {
        resolve()
      })
    })
    fs.copyFileSync(
      path.join(directory, 'a.json'),
      path.join(directory, 'c.json'),
    )
    expect(() => readFileSync(new URL('data:,x') as never)).toThrow()

    expect(paths.read).toStrictEqual([
      'a.json',
      'a.json',
      '',
      '',
      'missing.json',
      'b.json',
      'a.json',
      'a.json',
      'a.json',
      'a.json',
      'a.json',
      'a.json',
      'a.json',
      'a.json',
    ])
    expect(paths.written).toStrictEqual([
      'a.json',
      'w.json',
      'n.json',
      's.json',
      's.json',
      'c.json',
    ])
  })

  it('reports what copies, moves, links, removals and new directories read and change', async () => {
    let source = path.join(directory, 'source')
    mkdirSync(path.join(source, 'deep', 'node_modules'), { recursive: true })
    writeFileSync(path.join(source, 'deep', 'n.txt'), '1')
    writeFileSync(path.join(source, 'deep', 'node_modules', 'x.js'), '')
    let paths = record()
    mkdirSync(source, { recursive: true })
    mkdirSync(path.join(directory, 'made', 'inner'), { recursive: true })
    cpSync(source, path.join(directory, 'copy'), { recursive: true })
    cpSync(path.join(source, 'deep', 'n.txt'), path.join(directory, 'one.txt'))
    await fs.promises.copyFile(
      path.join(source, 'deep', 'n.txt'),
      path.join(directory, 'one.txt'),
    )
    renameSync(path.join(directory, 'one.txt'), path.join(directory, 'two.txt'))
    symlinkSync('two.txt', path.join(directory, 'link.txt'))
    symlinkSync(
      Buffer.from(path.join(directory, 'two.txt')),
      path.join(directory, 'link-b.txt'),
    )
    linkSync(path.join(directory, 'two.txt'), path.join(directory, 'hard.txt'))
    unlinkSync(path.join(directory, 'hard.txt'))
    rmSync(path.join(directory, 'copy'), { recursive: true })
    rmdirSync(path.join(directory, 'made', 'inner'))

    expect(() => {
      cpSync(path.join(directory, 'gone'), path.join(directory, 'gone-copy'))
    }).toThrow()

    expect(paths.read).toStrictEqual([
      'source',
      'source/deep',
      'source/deep/n.txt',
      'source/deep/n.txt',
      'source/deep/n.txt',
      'one.txt',
      'two.txt',
      'two.txt',
      'two.txt',
      'gone',
    ])
    expect(paths.written).toStrictEqual([
      'made/inner',
      'made',
      'copy',
      'one.txt',
      'one.txt',
      'one.txt',
      'two.txt',
      'link.txt',
      'link-b.txt',
      'hard.txt',
      'hard.txt',
      'copy',
      'made/inner',
      'gone-copy',
    ])
  })

  it('stops reporting without a receiver and ignores descriptors', () => {
    let paths = record()
    let descriptor = openSync(path.join(directory, 'a.json'), 'r')
    readFileSync(descriptor)
    closeSync(descriptor)
    let output = openSync(path.join(directory, 'd.json'), 'w')
    writeFileSync(output, '{}')
    closeSync(output)
    trackFileReads(null)
    readFileSync(path.join(directory, 'a.json'))

    expect(paths.read).toStrictEqual(['a.json'])
    expect(paths.written).toStrictEqual(['d.json'])
    expect(fs.readFileSync.name).toBe('readFileSync')
  })

  it('reports every directory a recursive listing reads', async () => {
    let tree = createTree('tree')
    let walked = ['', 'node_modules', 'sub', 'sub/deep'].map(file =>
      path.join('tree', file),
    )
    let followed = [
      ...walked,
      path.join('tree', 'link'),
      path.join('tree', 'link/deep'),
    ]
    let paths = record()
    fs.readdirSync(tree, { withFileTypes: true, recursive: true })
    await readdir(tree, { recursive: true })
    let opened = await fs.promises.opendir(tree, { recursive: true })
    await opened.close()
    fs.opendirSync(tree, { recursive: 1 } as never).closeSync()
    fs.readdirSync(tree)
    fs.readdirSync(tree, 'utf8')
    expect(() =>
      fs.readdirSync(path.join(tree, 'missing'), { recursive: true }),
    ).toThrow('ENOENT')
    trackFileReads(null)

    expect(paths.read.slice(0, 12).toSorted()).toStrictEqual(
      [...followed, ...followed].toSorted(),
    )
    expect(paths.read.slice(12, 20).toSorted()).toStrictEqual(
      [...walked, ...walked].toSorted(),
    )
    expect(paths.read.slice(20)).toStrictEqual([
      'tree',
      'tree',
      path.normalize('tree/missing'),
    ])
  })

  it('follows each real directory once in a recursive listing', () => {
    let tree = path.join(directory, 'loop')
    mkdirSync(path.join(tree, 'sub'), { recursive: true })
    symlinkSync(tree, path.join(tree, 'sub', 'back'))
    symlinkSync(path.join(tree, 'gone'), path.join(tree, 'broken'))
    writeFileSync(path.join(directory, 'loop-file.txt'), '')
    symlinkSync(
      path.join(directory, 'loop-file.txt'),
      path.join(tree, 'file-link'),
    )
    let paths = record()
    try {
      fs.readdirSync(tree, { recursive: true })
    } catch {}
    trackFileReads(null)

    expect(paths.read).toStrictEqual(
      ['', 'sub', 'sub/back'].map(file => path.join('loop', file)),
    )
  })

  it.runIf(typeof Reflect.get(fs, 'globSync') === 'function')(
    'reports every directory a glob may read',
    () => {
      let tree = createTree('glob')
      let globSync = Reflect.get(fs, 'globSync') as (
        pattern: string[] | string,
        options?: object,
      ) => string[]
      let paths = record()
      globSync(['sub/**/*.txt', 'sub/*/../*.txt'], { cwd: tree })
      globSync(path.join(tree, 'a.txt'))
      globSync('glob/sub/*', { cwd: pathToFileURL(directory) })
      vi.spyOn(process, 'cwd').mockReturnValue(path.join(tree, 'sub'))
      globSync('deep/*')
      vi.restoreAllMocks()
      expect(() => globSync([1] as never)).toThrow(TypeError)
      trackFileReads(null)

      expect(paths.read).toStrictEqual(
        [
          'sub',
          'sub/deep',
          '',
          'node_modules',
          'sub',
          'sub/deep',
          'a.txt',
          'sub',
          'sub/deep',
          'sub/deep',
        ].map(file => path.join('glob', file)),
      )
    },
  )

  it.runIf(typeof Reflect.get(fs, 'glob') === 'function')(
    'reports what an asynchronous glob reads, not its own calls',
    async () => {
      let tree = createTree('async-glob')
      let glob = Reflect.get(fs.promises, 'glob') as (
        pattern: string,
        options: object,
      ) => AsyncIterableIterator<string>
      let globCallback = Reflect.get(fs, 'glob') as (
        pattern: string,
        options: object,
        callback: (error: Error | null, matches: string[]) => void,
      ) => void
      let paths = record()
      let matches: string[] = []
      let iterator = glob('sub/**/*', { cwd: tree })
      for await (let match of iterator) {
        matches.push(match)
        readFileSync(path.join(tree, 'a.txt'))
      }
      let first = glob('*.txt', { cwd: tree })
      await first.next()
      await first.return!(undefined)
      let found = await new Promise<string[]>((resolve, reject) => {
        globCallback('sub/*', { cwd: tree }, (error, files) => {
          if (error) {
            reject(error)
          } else {
            resolve(files)
          }
        })
      })
      trackFileReads(null)

      expect(matches.toSorted()).toStrictEqual(
        [
          path.normalize('sub/deep'),
          path.normalize('sub/deep/b.txt'),
        ].toSorted(),
      )
      expect(found).toStrictEqual([path.normalize('sub/deep')])
      expect(paths.read).toStrictEqual(
        [
          'sub',
          'sub/deep',
          'a.txt',
          'a.txt',
          '',
          'node_modules',
          'sub',
          'sub/deep',
          'sub',
          'sub/deep',
        ].map(file => path.join('async-glob', file)),
      )
    },
  )
})
