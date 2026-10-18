import { writeFile, mkdtemp, mkdir, rm } from 'node:fs/promises'
import { afterEach, describe, expect, it } from 'vitest'
import { realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { collectNodeDependencies } from '../../../adapters/node-test/collect-node-dependencies'
import { createNodeTestEnd } from '../../helpers/create-node-test-end'

/**
 * Temporary project of the current test.
 */
let root = ''

describe('collectNodeDependencies', () => {
  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('lists modules, reads, the snapshot and the files that decide formats', async () => {
    root = realpathSync(await mkdtemp(path.join(tmpdir(), 'mootant-deps-')))
    await mkdir(path.join(root, 'src'))
    await writeFile(path.join(root, 'package.json'), '{}')
    await writeFile(path.join(root, 'tsconfig.json'), '{}')
    let file = path.join(root, 'a.test.js')
    let input = {
      records: [
        { file: path.join(root, 'src', 'b.js'), kind: 'load' as const },
        {
          file: path.join(root, 'node_modules', 'x', 'i.js'),
          kind: 'load' as const,
        },
        {
          file: path.join(root, 'mootant', 'preload', 'hooks.js'),
          kind: 'load' as const,
        },
        createNodeTestEnd({
          required: [path.join(root, 'src', 'c.cjs'), 'node:fs'],
          files: [path.join(root, 'data.txt'), 'relative.txt'],
        }),
      ],
      preload: path.join(root, 'mootant', 'preload', 'preload.js'),
      cache: { tsconfigs: new Map(), packages: new Map() },
      tsx: false,
      file,
    }

    expect(collectNodeDependencies(input)).toStrictEqual([
      path.join(root, 'a.test.js'),
      path.join(root, 'a.test.js.snapshot'),
      path.join(root, 'data.txt'),
      path.join(root, 'package.json'),
      path.join(root, 'src', 'b.js'),
      path.join(root, 'src', 'c.cjs'),
      path.join(root, 'src', 'package.json'),
    ])
    expect(collectNodeDependencies({ ...input, tsx: true })).toContain(
      path.join(root, 'tsconfig.json'),
    )
    expect(collectNodeDependencies({ ...input, records: [] })).toBeNull()
  })
})
