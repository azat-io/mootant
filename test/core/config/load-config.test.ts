import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import { writeFile, mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { loadConfig } from '../../../core/config/load-config'

let directory = ''

/**
 * Writes a file of the test project.
 *
 * @param name - Path inside the project.
 * @param text - Contents of the file.
 * @returns Absolute path of the file.
 */
async function write(name: string, text: string): Promise<string> {
  let file = path.join(directory, name)
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, text)
  return file
}

describe('loadConfig', () => {
  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'mootant-config-'))
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it.each([
    ['mootant.config.js', "export default { extends: ['strict'] }\n"],
    ['mootant.config.mjs', "export default { extends: ['strict'] }\n"],
    ['mootant.config.cjs', "module.exports = { extends: ['strict'] }\n"],
    [
      'mootant.config.ts',
      "export default { extends: ['strict'] as string[] }\n",
    ],
    [
      'mootant.config.mts',
      "export default { extends: ['strict'] as string[] }\n",
    ],
    ['.mootantrc.json', '{ "extends": ["strict"] }\n'],
    ['.mootantrc', '{ "extends": ["strict"] }\n'],
    [
      'package.json',
      '{ "name": "app", "mootant": { "extends": ["strict"] } }\n',
    ],
  ])('finds %s from a nested directory', async (name, text) => {
    let file = await write(name, text)
    await mkdir(path.join(directory, 'src/deep'), { recursive: true })

    await expect(
      loadConfig(undefined, path.join(directory, 'src/deep')),
    ).resolves.toStrictEqual({
      config: { extends: ['strict'] },
      directory,
      file,
    })
  })

  it.each(['false', '0', '""', '[]'])(
    'rejects "mootant": %s in package.json instead of searching further up',
    async value => {
      await write('mootant.config.js', 'export default {}\n')
      await write('app/package.json', `{ "name": "app", "mootant": ${value} }`)

      await expect(
        loadConfig(undefined, path.join(directory, 'app')),
      ).rejects.toThrow(
        'Invalid configuration in package.json: it must export an object.',
      )
    },
  )

  it('skips a package.json without the mootant key', async () => {
    await write('package.json', '{ "name": "app" }\n')
    let file = await write('app/mootant.config.js', 'export default {}\n')
    await write('app/package.json', '{ "name": "inner" }\n')

    await expect(
      loadConfig(undefined, path.join(directory, 'app')),
    ).resolves.toMatchObject({ directory: path.join(directory, 'app'), file })
  })

  it('reads an empty --config file as an empty configuration', async () => {
    await write('empty.json', '')

    await expect(loadConfig('empty.json', directory)).resolves.toMatchObject({
      config: {},
    })
  })

  it.each(['empty.mjs', 'empty.ts'])(
    'reads an empty --config script %s as an empty configuration',
    async name => {
      await write(name, '\n')

      await expect(loadConfig(name, directory)).resolves.toMatchObject({
        config: {},
      })
    },
  )

  it.each([
    [
      'mootant.config.js',
      "export let mutators = { 'string-literal': 'off' }\n",
    ],
    [
      'mootant.config.mjs',
      "export let mutators = { 'string-literal': 'off' }\n",
    ],
    [
      'mootant.config.ts',
      "export let mutators = { 'string-literal': 'off' }\n",
    ],
    [
      'mootant.config.mts',
      "export let mutators = { 'string-literal': 'off' }\n",
    ],
  ])('rejects %s without a default export', async (name, text) => {
    await write(name, text)

    await expect(loadConfig(undefined, directory)).rejects.toThrow(
      `Invalid configuration in ${name}: it must have a default export.`,
    )
  })

  it('rejects a --config script without a default export', async () => {
    await write('mutation.mjs', 'export let mutators = {}\n')

    await expect(loadConfig('mutation.mjs', directory)).rejects.toThrow(
      'Invalid configuration in mutation.mjs: it must have a default export.',
    )
  })

  it.each(['mootant.config.mjs', 'mootant.config.ts'])(
    'rejects %s with only a comment',
    async name => {
      await write(name, '// just a comment\n')

      await expect(loadConfig(undefined, directory)).rejects.toThrow(
        `Invalid configuration in ${name}: it must have a default export.`,
      )
      await expect(loadConfig(name, directory)).rejects.toThrow(
        `Invalid configuration in ${name}: it must have a default export.`,
      )
    },
  )

  it('searches past an empty configuration script', async () => {
    await write('mootant.config.mjs', '')

    await expect(loadConfig(undefined, directory)).resolves.toBeNull()
  })

  it('searches past an empty configuration file', async () => {
    await write('.mootantrc.json', '')

    await expect(loadConfig(undefined, directory)).resolves.toBeNull()
  })

  it('loads the file given with --config', async () => {
    let file = await write('configs/mutation.json', '{ "extends": ["strict"] }')

    await expect(
      loadConfig('configs/mutation.json', directory),
    ).resolves.toStrictEqual({
      directory: path.join(directory, 'configs'),
      config: { extends: ['strict'] },
      file,
    })
  })

  it('reports a missing --config file', async () => {
    await expect(loadConfig('missing.json', directory)).rejects.toThrow(
      'Cannot find the configuration file missing.json.',
    )
  })

  it('reports a file that cannot be loaded', async () => {
    await write('broken.json', '{ bad')

    await expect(loadConfig('broken.json', directory)).rejects.toThrow(
      /^Cannot load broken\.json: /u,
    )
  })

  it('reports a found file that cannot be loaded', async () => {
    await write('mootant.config.js', 'export default {')

    await expect(loadConfig(undefined, directory)).rejects.toThrow(
      /^Cannot load the configuration: /u,
    )
  })

  it('names the file of an invalid configuration relative to the working directory', async () => {
    await write('.mootantrc.json', '{ "extend": [] }')
    await mkdir(path.join(directory, 'src'))

    await expect(
      loadConfig(undefined, path.join(directory, 'src')),
    ).rejects.toThrow(
      `Invalid configuration in ${path.join('..', '.mootantrc.json')}: "extend" is not a configuration key (did you mean "extends"?).`,
    )
  })
})
