import { writeFile, mkdtemp, mkdir, rm } from 'node:fs/promises'
import { afterEach, describe, expect, it } from 'vitest'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { checkTypeScript } from '../../../adapters/node-test/check-typescript'

/**
 * Temporary project of the current test.
 */
let root = ''

/**
 * Creates a project.
 *
 * @param manifests - Texts of its `package.json` files by directory relative to
 *   it.
 */
async function createProject(manifests: Record<string, string>): Promise<void> {
  root = await mkdtemp(path.join(tmpdir(), 'mootant-ts-'))
  await Promise.all(
    Object.entries(manifests).map(async ([directory, manifest]) => {
      await mkdir(path.join(root, directory), { recursive: true })
      await writeFile(path.join(root, directory, 'package.json'), manifest)
    }),
  )
}

/**
 * Gives the absolute path of a file of the project.
 *
 * @param file - Path relative to the project.
 * @returns Absolute path.
 */
function inRoot(file: string): string {
  return path.join(root, file)
}

describe('checkTypeScript', () => {
  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('accepts runs without TypeScript or with type stripping', async () => {
    await createProject({})

    expect(
      checkTypeScript({
        loaders: ['ts-node/register'],
        files: [inRoot('a.test.js')],
        version: 'v20.19.0',
        strips: false,
        root,
      }),
    ).toBeNull()
    expect(
      checkTypeScript({
        files: [inRoot('a.test.ts')],
        version: 'v22.18.0',
        strips: true,
        loaders: [],
        root,
      }),
    ).toBeNull()
  })

  it('needs tsx without type stripping', async () => {
    await createProject({ '.': '{"type":"module"}' })

    expect(
      checkTypeScript({
        files: [inRoot('a.test.mts')],
        loaders: ['./setup.js'],
        version: 'v20.19.0',
        strips: false,
        root,
      }),
    ).toBe(
      `Node v20.19.0 cannot run the TypeScript files of ${root} without a loader; add tsx (--import tsx) to the test command or use Node 22.18 or later.`,
    )
    expect(
      checkTypeScript({
        loaders: ['file:///p/node_modules/tsx/dist/loader.mjs'],
        files: [inRoot('a.test.ts')],
        version: 'v20.19.0',
        strips: false,
        root,
      }),
    ).toBeNull()
  })

  it('rejects TypeScript loaders other than tsx', async () => {
    await createProject({ '.': '{"type":"module"}' })

    expect(
      checkTypeScript({
        loaders: ['tsx', 'ts-node/esm'],
        files: [inRoot('a.test.ts')],
        version: 'v26.11.1',
        strips: true,
        root,
      }),
    ).toBe(
      `mootant switches TypeScript files only through Node's type stripping or tsx (--import tsx), so it cannot run the tests of ${root} with ts-node/esm.`,
    )
  })

  it('rejects TypeScript that tsx loads as CommonJS', async () => {
    let message = `mootant cannot switch TypeScript files that tsx loads as CommonJS, such as `
    let tail = `; add "type": "module" to its package.json or run the tests with Node's type stripping instead of tsx.`
    await createProject({
      old: '{"type":"commonjs"}',
      new: '{"type":"module"}',
      '.': '{"type":"module"}',
      bad: 'broken',
      plain: '{}',
    })

    expect(
      checkTypeScript({
        files: [
          inRoot('a.test.ts'),
          inRoot('b.mts'),
          inRoot('new/c.ts'),
          inRoot('e.ts'),
        ],
        version: 'v22.23.3',
        loaders: ['tsx'],
        strips: true,
        root,
      }),
    ).toBeNull()
    expect(
      checkTypeScript({
        files: [inRoot('a.test.ts'), inRoot('b.cts')],
        loaders: ['tsx/esm'],
        version: 'v22.23.3',
        strips: true,
        root,
      }),
    ).toBe(`${message}b.cts${tail}`)
    expect(
      checkTypeScript({
        files: [inRoot('a.test.ts'), inRoot('old/x/y.ts')],
        version: 'v20.19.0',
        loaders: ['tsx'],
        strips: false,
        root,
      }),
    ).toBe(`${message}${path.join('old', 'x', 'y.ts')}${tail}`)
    expect(
      checkTypeScript({
        files: [inRoot('plain/z.ts')],
        version: 'v20.19.0',
        loaders: ['tsx'],
        strips: false,
        root,
      }),
    ).toBe(`${message}${path.join('plain', 'z.ts')}${tail}`)
    expect(
      checkTypeScript({
        files: [inRoot('bad/z.ts')],
        version: 'v20.19.0',
        loaders: ['tsx'],
        strips: false,
        root,
      }),
    ).toBe(`${message}${path.join('bad', 'z.ts')}${tail}`)
  })
})
