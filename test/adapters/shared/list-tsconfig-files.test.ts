import { writeFile, realpath, mkdtemp, mkdir, rm } from 'node:fs/promises'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { listTsconfigFiles } from '../../../adapters/shared/list-tsconfig-files'

/**
 * Real path of the temporary project of the tests.
 */
let root = ''

/**
 * Writes files of the temporary project, creating their directories.
 *
 * @param files - Texts by path relative to the project.
 */
async function write(files: Record<string, string>): Promise<void> {
  await Promise.all(
    Object.entries(files).map(async ([name, content]) => {
      let file = path.join(root, name)
      await mkdir(path.dirname(file), { recursive: true })
      await writeFile(file, content)
    }),
  )
}

describe('listTsconfigFiles', () => {
  beforeAll(async () => {
    root = await realpath(await mkdtemp(path.join(tmpdir(), 'mootant-tsc-')))
    await mkdir(path.join(root, 'src/deep'), { recursive: true })
    await writeFile(
      path.join(root, 'tsconfig.json'),
      '{ "extends": ["./a.json", "./b.json"] }',
    )
    await writeFile(path.join(root, 'a.json'), '{ "extends": "./b.json" }')
    await writeFile(path.join(root, 'b.json'), '{ "extends": "./a.json" }')
  })

  afterAll(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('lists the closer candidates, the closest file and its extends chain', () => {
    let cache = new Map<string, string[]>()
    let expected = [
      path.join(root, 'src/deep/tsconfig.json'),
      path.join(root, 'src/tsconfig.json'),
      path.join(root, 'tsconfig.json'),
      path.join(root, 'a.json'),
      path.join(root, 'b.json'),
    ]

    expect(listTsconfigFiles(path.join(root, 'src/deep'), cache)).toStrictEqual(
      expected,
    )
    expect(cache.get(path.join(root, 'src'))).toStrictEqual(expected.slice(1))
    expect(listTsconfigFiles(path.join(root, 'src/deep'), cache)).toBe(
      cache.get(path.join(root, 'src/deep')),
    )
  })

  it('lists the files the found one references, missing ones too, the files those reference and the extends chain of each', async () => {
    await write({
      'packages/web/tsconfig.json': JSON.stringify({
        references: [
          { path: './tsconfig.app.json' },
          { path: './src' },
          { path: '../shared/tsconfig.lib.json' },
          { path: './tsconfig.missing.json' },
        ],
        files: [],
      }),
      'packages/web/tsconfig.app.json': JSON.stringify({
        references: [{ path: './tsconfig.node.json' }],
        extends: './configs/app.json',
      }),
      'packages/web/configs/app.json': JSON.stringify({
        references: [{ path: './ignored.json' }],
      }),
      'packages/web/src/tsconfig.json': '{ "extends": "../configs/src.json" }',
      'packages/shared/tsconfig.lib.json': '{ "extends": "./base.json" }',
      'packages/web/tsconfig.node.json': '{}',
      'packages/web/configs/src.json': '{}',
      'packages/shared/base.json': '{}',
    })

    expect(
      listTsconfigFiles(path.join(root, 'packages/web/test'), new Map(), {
        references: true,
      }),
    ).toStrictEqual([
      path.join(root, 'packages/web/test/tsconfig.json'),
      path.join(root, 'packages/web/tsconfig.json'),
      path.join(root, 'packages/web/tsconfig.app.json'),
      path.join(root, 'packages/web/src/tsconfig.json'),
      path.join(root, 'packages/shared/tsconfig.lib.json'),
      path.join(root, 'packages/web/tsconfig.missing.json'),
      path.join(root, 'packages/web/tsconfig.node.json'),
      path.join(root, 'packages/web/configs/app.json'),
      path.join(root, 'packages/web/configs/src.json'),
      path.join(root, 'packages/shared/base.json'),
    ])
  })

  it('lists each file once through cycles of references and references to itself', async () => {
    await write({
      'cycle/tsconfig.json': JSON.stringify({
        references: [
          { path: '.' },
          { path: './b.json' },
          { path: './tsconfig.json' },
        ],
      }),
      'cycle/b.json': JSON.stringify({
        references: [
          { path: './tsconfig.json' },
          { path: './b.json' },
          { path: './c.json' },
        ],
      }),
      'cycle/c.json': JSON.stringify({
        references: [{ path: './b.json' }],
        extends: './tsconfig.json',
      }),
    })

    expect(
      listTsconfigFiles(path.join(root, 'cycle'), new Map(), {
        references: true,
      }),
    ).toStrictEqual([
      path.join(root, 'cycle/tsconfig.json'),
      path.join(root, 'cycle/b.json'),
      path.join(root, 'cycle/c.json'),
    ])
  })

  it('lists a missing file once when a file above references its directory', async () => {
    await write({
      'outer/tsconfig.json': JSON.stringify({
        references: [{ path: './src' }],
        files: [],
      }),
    })
    let cache = new Map<string, string[]>()

    expect(
      listTsconfigFiles(path.join(root, 'outer/src'), cache, {
        references: true,
      }),
    ).toStrictEqual([
      path.join(root, 'outer/src/tsconfig.json'),
      path.join(root, 'outer/tsconfig.json'),
    ])
    expect(
      listTsconfigFiles(path.join(root, 'outer/src/deep'), cache, {
        references: true,
      }),
    ).toStrictEqual([
      path.join(root, 'outer/src/deep/tsconfig.json'),
      path.join(root, 'outer/src/tsconfig.json'),
      path.join(root, 'outer/tsconfig.json'),
    ])
  })

  it('follows no references when they are off', async () => {
    await write({
      'off/tsconfig.json': JSON.stringify({
        references: [{ path: './tsconfig.app.json' }],
        extends: './base.json',
      }),
      'off/tsconfig.app.json': '{}',
      'off/base.json': '{}',
    })

    expect(listTsconfigFiles(path.join(root, 'off'), new Map())).toStrictEqual([
      path.join(root, 'off/tsconfig.json'),
      path.join(root, 'off/base.json'),
    ])
  })

  it('walks up to the file system root without a tsconfig file', () => {
    let files = listTsconfigFiles(path.parse(root).root, new Map())

    expect(files).toStrictEqual([
      path.join(path.parse(root).root, 'tsconfig.json'),
    ])
  })
})
