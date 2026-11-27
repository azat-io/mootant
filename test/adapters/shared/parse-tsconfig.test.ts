import { writeFile, realpath, mkdtemp, rm } from 'node:fs/promises'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { parseTsconfig } from '../../../adapters/shared/parse-tsconfig'

/**
 * Real path of the temporary directory of the tests.
 */
let root = ''

/**
 * Writes a file of the temporary directory.
 *
 * @param name - Name of the file.
 * @param content - Text of the file.
 * @returns Absolute path of the file.
 */
async function write(name: string, content: string): Promise<string> {
  let file = path.join(root, name)
  await writeFile(file, content)
  return file
}

describe('parseTsconfig', () => {
  beforeAll(async () => {
    root = await realpath(await mkdtemp(path.join(tmpdir(), 'mootant-tsp-')))
  })

  afterAll(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('parses JSON with comments, trailing commas and a byte order mark', async () => {
    let file = await write(
      'tsconfig.json',
      `${String.fromCodePoint(0xfe_ff)}{\n  // "files": [],\n  /* a */ "include": ["src",],\n}\n`,
    )

    expect(parseTsconfig(file)).toMatchObject({
      properties: [
        {
          value: { elements: [{ value: 'src' }], type: 'ArrayExpression' },
          key: { value: 'include' },
        },
      ],
      type: 'ObjectExpression',
    })
  })

  it('gives the expression a file holds when it is no object', async () => {
    expect(parseTsconfig(await write('null.json', 'null'))).toMatchObject({
      type: 'Literal',
      value: null,
    })
  })

  it('gives null for a file that cannot be read or parsed or holds more than one expression', async () => {
    expect(parseTsconfig(await write('bad.json', '{'))).toBeNull()
    expect(parseTsconfig(await write('two.json', '{}); ({}'))).toBeNull()
    expect(parseTsconfig(path.join(root, 'missing.json'))).toBeNull()
  })
})
