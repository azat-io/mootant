import { writeFile, realpath, mkdtemp, mkdir, rm } from 'node:fs/promises'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { readTsconfigReferences } from '../../../adapters/shared/read-tsconfig-references'

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

describe('readTsconfigReferences', () => {
  beforeAll(async () => {
    root = await realpath(await mkdtemp(path.join(tmpdir(), 'mootant-ref-')))
  })

  afterAll(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('lists files referenced by a file, a directory, a path outside the directory and an absolute path, missing ones too', async () => {
    let absolute = path.join(root, 'configs/tsconfig.base.json')
    let file = await write(
      'web/tsconfig.json',
      `{
        // "references": [{ "path": "./commented.json" }],
        "files": [],
        "references": [
          { "path": "./tsconfig.app.json" },
          { "path": "./src", "prepend": true },
          { path: "../shared/tsconfig.lib.json", },
          { "path": ${JSON.stringify(absolute)} },
          { "path": "./tsconfig.missing.json" },
        ],
      }`,
    )

    expect(readTsconfigReferences(file)).toStrictEqual([
      path.join(root, 'web/tsconfig.app.json'),
      path.join(root, 'web/src/tsconfig.json'),
      path.join(root, 'shared/tsconfig.lib.json'),
      absolute,
      path.join(root, 'web/tsconfig.missing.json'),
    ])
  })

  it('reads the last references property and leaves out references that are no object or have no string path', async () => {
    let file = await write(
      'odd/tsconfig.json',
      `{
        "references": [{ "path": "./first.json" }],
        "references": [
          "./string.json",
          { "path": 1 },
          { "name": "./name.json" },
          { ["path"]: "./computed.json" },
          ...[{ "path": "./spread.json" }],
          ,
          null,
          { "path": "./a.json", "path": "./b.json" },
        ],
      }`,
    )

    expect(readTsconfigReferences(file)).toStrictEqual([
      path.join(root, 'odd/b.json'),
    ])
  })

  it('gives nothing for a file that cannot be read or parsed or whose references are no array', async () => {
    expect(
      readTsconfigReferences(await write('bad/tsconfig.json', '{')),
    ).toStrictEqual([])
    expect(
      readTsconfigReferences(
        await write(
          'object/tsconfig.json',
          '{ "references": { "path": "./a.json" } }',
        ),
      ),
    ).toStrictEqual([])
    expect(
      readTsconfigReferences(await write('none/tsconfig.json', '{}')),
    ).toStrictEqual([])
    expect(
      readTsconfigReferences(path.join(root, 'missing/tsconfig.json')),
    ).toStrictEqual([])
  })
})
