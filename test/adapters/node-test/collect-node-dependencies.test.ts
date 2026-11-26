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

  it('lists modules, reads, the snapshot and the files that decide formats, installed packages too', async () => {
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
      path.join(root, 'node_modules', 'package.json'),
      path.join(root, 'node_modules', 'x', 'i.js'),
      path.join(root, 'node_modules', 'x', 'package.json'),
      path.join(root, 'package.json'),
      path.join(root, 'src', 'b.js'),
      path.join(root, 'src', 'c.cjs'),
      path.join(root, 'src', 'package.json'),
    ])
    expect(collectNodeDependencies({ ...input, tsx: true })).toContain(
      path.join(root, 'tsconfig.json'),
    )
    expect(collectNodeDependencies({ ...input, tsx: true })).not.toContain(
      path.join(root, 'node_modules', 'x', 'tsconfig.json'),
    )
    expect(collectNodeDependencies({ ...input, records: [] })).toBeNull()
  })

  it('lists the manifest of the package of a module that a nested package.json gives its format', async () => {
    root = realpathSync(await mkdtemp(path.join(tmpdir(), 'mootant-deps-')))
    let esm = path.join(root, 'node_modules', '@s', 'p', 'dist', 'esm')
    await mkdir(esm, { recursive: true })
    await writeFile(path.join(esm, 'package.json'), '{ "type": "module" }')
    await writeFile(path.join(root, 'package.json'), '{}')
    let file = path.join(root, 'a.test.js')

    expect(
      collectNodeDependencies({
        records: [
          { file: path.join(esm, 'm.js'), kind: 'load' },
          createNodeTestEnd(),
        ],
        preload: path.join(root, 'mootant', 'preload', 'preload.js'),
        cache: { tsconfigs: new Map(), packages: new Map() },
        tsx: false,
        file,
      }),
    ).toStrictEqual([
      file,
      `${file}.snapshot`,
      path.join(esm, 'm.js'),
      path.join(esm, 'package.json'),
      path.join(root, 'node_modules', '@s', 'p', 'package.json'),
      path.join(root, 'package.json'),
    ])
  })
})
