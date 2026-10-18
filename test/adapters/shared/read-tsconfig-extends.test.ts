import {
  writeFile,
  realpath,
  symlink,
  mkdtemp,
  mkdir,
  rm,
} from 'node:fs/promises'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { readTsconfigExtends } from '../../../adapters/shared/read-tsconfig-extends'

/**
 * Real path of the temporary project of the tests.
 */
let root = ''

/**
 * Writes a file of the temporary project, creating its directory.
 *
 * @param name - Path relative to the project.
 * @param content - Text of the file.
 * @returns Absolute path of the file.
 */
async function write(name: string, content: string): Promise<string> {
  let file = path.join(root, name)
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, content)
  return file
}

describe('readTsconfigExtends', () => {
  beforeAll(async () => {
    root = await realpath(await mkdtemp(path.join(tmpdir(), 'mootant-ext-')))
    await write('configs/base.json', '{}')
    await write('configs/strict.json', '{}')
    await write('shared/tsconfig.json', '{}')
    await write('shared/package.json', '{ "name": "shared" }')
    await write('node_modules/@tsconfig/node/tsconfig.json', '{}')
    await write('node_modules/@tsconfig/node/package.json', '{}')
    await mkdir(path.join(root, 'node_modules/@company'), { recursive: true })
    await symlink(
      path.join(root, 'shared'),
      path.join(root, 'node_modules/@company/shared'),
    )
  })

  afterAll(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('lists extended files by path and from workspace packages', async () => {
    let file = await write(
      'tsconfig.json',
      `{
        // "extends": "./commented.json",
        /* a "string" in a comment */
        "compilerOptions": { "paths": { "@/*": ["./src/*"] }, },
        "extends": [
          "./configs/base",
          "./configs/strict.json",
          "./configs/missing.json",
          "@company/shared",
          "@tsconfig/node",
          "@company/unknown",
          1,
        ],
      }`,
    )

    expect(readTsconfigExtends(file)).toStrictEqual([
      path.join(root, 'configs/base.json'),
      path.join(root, 'configs/strict.json'),
      path.join(root, 'shared/tsconfig.json'),
    ])
  })

  it('reads a single extended file given by an absolute path', async () => {
    let file = await write(
      'single/tsconfig.json',
      JSON.stringify({ extends: path.join(root, 'configs/base.json') }),
    )

    expect(readTsconfigExtends(file)).toStrictEqual([
      path.join(root, 'configs/base.json'),
    ])
  })

  it.each([
    [
      'a comment after a trailing comma',
      '{\n  "extends": "../configs/base.json", // shared config\n}',
    ],
    [
      'block comments between a comma and the brace',
      '{ "extends": "../configs/base.json", /* a */ /* b */ }',
    ],
    [
      'comment markers inside strings',
      '{ "a": "// not a comment", "b": "/* nor this */", "extends": "../configs/base.json" }',
    ],
    [
      'URLs in strings',
      '{ "$schema": "https://json.schemastore.org/tsconfig", "extends": "../configs/base.json" }',
    ],
    [
      'nested trailing commas',
      '{ "compilerOptions": { "lib": ["es2024",], "paths": { "@/*": ["./src/*",], }, }, "extends": "../configs/base.json", }',
    ],
    [
      'a byte order mark',
      `${String.fromCodePoint(0xfe_ff)}{ "extends": "../configs/base.json" }`,
    ],
    [
      'a line comment at the end',
      '{ "extends": "../configs/base.json" } // end',
    ],
    [
      'a later extends property',
      '{ "extends": "../configs/strict.json", extends: "../configs/base.json" }',
    ],
  ])('reads JSON with %s', async (name, content) => {
    let file = await write(`jsonc/${name.replaceAll(' ', '-')}.json`, content)

    expect(readTsconfigExtends(file)).toStrictEqual([
      path.join(root, 'configs/base.json'),
    ])
  })

  it('gives nothing for a file that cannot be parsed or extends nothing', async () => {
    expect(
      readTsconfigExtends(await write('bad/tsconfig.json', '{')),
    ).toStrictEqual([])
    expect(
      readTsconfigExtends(await write('null/tsconfig.json', 'null')),
    ).toStrictEqual([])
    expect(
      readTsconfigExtends(await write('two/tsconfig.json', '{}, {}')),
    ).toStrictEqual([])
    expect(
      readTsconfigExtends(
        await write(
          'computed/tsconfig.json',
          '{ ["extends"]: "./configs/base.json", ...{}, "a": 1 }',
        ),
      ),
    ).toStrictEqual([])
    expect(
      readTsconfigExtends(
        await write('number/tsconfig.json', '{ "extends": [, 1] }'),
      ),
    ).toStrictEqual([])
    expect(readTsconfigExtends(path.join(root, 'missing.json'))).toStrictEqual(
      [],
    )
  })
})
