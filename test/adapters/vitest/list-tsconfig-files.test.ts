import { writeFile, realpath, mkdtemp, mkdir, rm } from 'node:fs/promises'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { listTsconfigFiles } from '../../../adapters/vitest/list-tsconfig-files'

/**
 * Real path of the temporary project of the tests.
 */
let root = ''

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

  it('walks up to the file system root without a tsconfig file', () => {
    let files = listTsconfigFiles(path.parse(root).root, new Map())

    expect(files).toStrictEqual([
      path.join(path.parse(root).root, 'tsconfig.json'),
    ])
  })
})
