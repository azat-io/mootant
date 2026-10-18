import { writeFile, mkdtemp, mkdir, rm } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { listPackageFiles } from '../../../adapters/node-test/list-package-files'

describe('listPackageFiles', () => {
  it('lists package.json paths up to the first that exists', async () => {
    let root = await mkdtemp(path.join(tmpdir(), 'mootant-packages-'))
    let deep = path.join(root, 'a', 'b')
    await mkdir(deep, { recursive: true })
    await writeFile(path.join(root, 'package.json'), '{}')
    let cache = new Map<string, string[]>()

    expect(listPackageFiles(deep, cache)).toStrictEqual([
      path.join(deep, 'package.json'),
      path.join(root, 'a', 'package.json'),
      path.join(root, 'package.json'),
    ])
    expect(cache.get(path.join(root, 'a'))).toHaveLength(2)
    expect(listPackageFiles(deep, cache)).toBe(cache.get(deep))

    await rm(root, { recursive: true })
  })

  it('stops at the file system root', () => {
    let top = path.parse(process.cwd()).root

    expect(listPackageFiles(top, new Map())).toStrictEqual([
      path.join(top, 'package.json'),
    ])
  })
})
