import type * as FileSystem from 'node:fs/promises'

import {
  beforeEach,
  beforeAll,
  afterAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { writeFile, mkdtemp, mkdir, rm } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { UNKNOWN_HASH } from '../../../core/cache/unknown-hash'
import { hashFiles } from '../../../core/cache/hash-files'

vi.mock(import('node:fs/promises'), async importOriginal => ({
  ...(await importOriginal()),
  readFile: vi.fn(),
  readdir: vi.fn(),
  stat: vi.fn(),
}))

let { readFile, readdir, stat } = await import('node:fs/promises')
let actual = await vi.importActual<typeof FileSystem>('node:fs/promises')

/**
 * Directory with the files of the tests.
 */
let directory = ''

describe('hashFiles', () => {
  beforeAll(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'mootant-hash-'))
    await Promise.all(
      Array.from({ length: 40 }, (_value, index) =>
        writeFile(path.join(directory, `${index}.ts`), String(index % 2)),
      ),
    )
  })

  beforeEach(() => {
    vi.mocked(readFile).mockReset()
    vi.mocked(readFile).mockImplementation(actual.readFile)
    vi.mocked(readdir).mockReset()
    vi.mocked(readdir).mockImplementation(actual.readdir)
    vi.mocked(stat).mockReset()
    vi.mocked(stat).mockImplementation(actual.stat)
  })

  afterAll(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('hashes each file once, equal contents equally', async () => {
    let first = path.join(directory, '0.ts')
    let hashes = await hashFiles([
      first,
      first,
      path.join(directory, '1.ts'),
      path.join(directory, '2.ts'),
    ])

    expect(readFile).toHaveBeenCalledTimes(3)
    expect(hashes.size).toBe(3)
    expect(hashes.get(first)).toMatch(/^[\da-f]{64}$/u)
    expect(hashes.get(path.join(directory, '2.ts'))).toBe(hashes.get(first))
    expect(hashes.get(path.join(directory, '1.ts'))).not.toBe(hashes.get(first))
  })

  it('gives null for files that cannot be read', async () => {
    vi.mocked(readdir).mockRejectedValueOnce(new Error('EACCES'))
    let hashes = await hashFiles([
      path.join(directory, 'missing.ts'),
      directory,
    ])

    expect([...hashes.values()]).toStrictEqual([null, null])
  })

  it('reads neither a pipe nor a device, which may never end, and tells their content apart from a missing file', async () => {
    let pipe = path.join(directory, 'pipe')
    /* Cspell:disable-next-line */
    execFileSync('mkfifo', [pipe])
    let hashes = await hashFiles([pipe, '/dev/null'])

    expect(Object.fromEntries(hashes)).toStrictEqual({
      '/dev/null': UNKNOWN_HASH,
      [pipe]: UNKNOWN_HASH,
    })
    expect(readFile).not.toHaveBeenCalled()
    expect(readdir).not.toHaveBeenCalled()
  })

  it('hashes a directory by the names in it', async () => {
    let folder = path.join(directory, 'folder')
    await mkdir(folder)
    await writeFile(path.join(folder, 'b.json'), '')
    await writeFile(path.join(folder, 'a.json'), '')
    let before = (await hashFiles([folder])).get(folder)
    await writeFile(path.join(folder, 'a.json'), 'changed')
    let edited = (await hashFiles([folder])).get(folder)
    await writeFile(path.join(folder, 'c.json'), '')
    let added = (await hashFiles([folder])).get(folder)
    await mkdir(path.join(folder, 'd'))
    let nested = (await hashFiles([folder])).get(folder)
    await writeFile(path.join(folder, 'd/e.json'), '')
    let inner = (await hashFiles([folder])).get(folder)
    await rm(path.join(folder, 'd'), { recursive: true })
    await writeFile(path.join(folder, 'd'), '')
    let replaced = (await hashFiles([folder])).get(folder)
    await rm(folder, { recursive: true })

    expect(before).toMatch(/^[\da-f]{64}$/u)
    expect(edited).toBe(before)
    expect(added).not.toBe(before)
    expect(nested).not.toBe(added)
    expect(inner).toBe(nested)
    expect(replaced).not.toBe(nested)
  })

  it('reads at most 32 files at once', async () => {
    vi.mocked(stat).mockResolvedValue({
      isDirectory: () => false,
      isFile: () => true,
    } as never)
    let reading = 0
    let most = 0
    vi.mocked(readFile).mockImplementation(async () => {
      reading += 1
      most = Math.max(most, reading)
      await new Promise(resolve => {
        setTimeout(resolve, 1)
      })
      reading -= 1
      return Buffer.from('')
    })
    let hashes = await hashFiles(
      Array.from({ length: 40 }, (_value, index) =>
        path.join(directory, `${index}.ts`),
      ),
    )

    expect(hashes.size).toBe(40)
    expect(most).toBe(32)
  })
})
