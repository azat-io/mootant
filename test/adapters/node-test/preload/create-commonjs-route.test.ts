import { afterEach, describe, expect, it, vi } from 'vitest'
import { writeFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { createCommonJsRoute } from '../../../../adapters/node-test/preload/create-commonjs-route'

/**
 * Directory of the current test.
 */
let directory = ''

/**
 * Writes a `package.json` to the directory of the test.
 *
 * @param text - Text of the file.
 * @returns Absolute path of the file.
 */
async function writeManifest(text: string): Promise<string> {
  directory = await mkdtemp(path.join(tmpdir(), 'mootant-route-'))
  let manifest = path.join(directory, 'package.json')
  await writeFile(manifest, text)
  return manifest
}

describe('createCommonJsRoute', () => {
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('sends CommonJS that Node read itself through the CommonJS loader', () => {
    let route = createCommonJsRoute(() => {})
    let source = Buffer.from('code')

    expect(
      route('file:///src/a.cjs', { format: 'commonjs', source }),
    ).toStrictEqual({ format: 'commonjs-sync', source })
    expect(
      route('file:///node_modules/b/index.js', { format: 'commonjs', source }),
    ).toStrictEqual({ format: 'commonjs-sync', source })
  })

  it('keeps results that would not load as plain Node loads them', () => {
    let route = createCommonJsRoute(() => {})
    let source = Buffer.from('code')

    expect(
      route('file:///src/a.cjs', { format: 'commonjs', source: 'code' }),
    ).toBeNull()
    expect(
      route('file:///src/a.cjs', {
        source: new Uint8Array(source),
        format: 'commonjs',
      }),
    ).toBeNull()
    expect(route('file:///src/a.cjs', { format: 'module', source })).toBeNull()
    expect(route('node:fs', { format: 'commonjs', source })).toBeNull()
    expect(
      route('file:///src/a.cjs?v=1', { format: 'commonjs', source }),
    ).toBeNull()
    expect(route('file:///src/c.ts', { format: 'commonjs', source })).toBeNull()
    expect(
      route('file:///src/d.mjs', { format: 'commonjs', source }),
    ).toBeNull()
  })

  it('takes the format of a .js file from its package.json once', async () => {
    let manifest = await writeManifest('{"type":"commonjs"}')
    let findPackage = vi.fn<(url: string) => undefined | string>(() => manifest)
    let route = createCommonJsRoute(findPackage)
    let source = Buffer.from('code')

    expect(
      route('file:///src/b.js', { format: 'commonjs', source }),
    ).toStrictEqual({ format: 'commonjs-sync', source })

    await writeFile(manifest, '{"type":"module"}')

    expect(
      route('file:///src/b.js', { format: 'commonjs', source }),
    ).toStrictEqual({ format: 'commonjs-sync', source })
    expect(findPackage).toHaveBeenCalledWith('file:///src/b.js')
    expect(
      createCommonJsRoute(findPackage)('file:///src/b.js', {
        format: 'commonjs',
        source,
      }),
    ).toBeNull()
  })

  it('takes .cjs files as CommonJS whatever their package.json says', async () => {
    let manifest = await writeManifest('{"type":"module"}')
    let findPackage = vi.fn<(url: string) => undefined | string>(() => manifest)
    let source = Buffer.from('code')

    expect(
      createCommonJsRoute(findPackage)('file:///src/a.cjs', {
        format: 'commonjs',
        source,
      }),
    ).toStrictEqual({ format: 'commonjs-sync', source })
    expect(findPackage).not.toHaveBeenCalled()
  })
})
