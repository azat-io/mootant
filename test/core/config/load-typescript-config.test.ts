import {
  afterEach,
  beforeAll,
  afterAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import {
  writeFile,
  realpath,
  mkdtemp,
  symlink,
  mkdir,
  rm,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { loadTypescriptConfig } from '../../../core/config/load-typescript-config'

let directory = ''

/**
 * Imports `loadTypescriptConfig` again with a stand-in for `jiti`: version 2,
 * whose `import` gives a module with the imported path as its default export,
 * version 1, which has no `createJiti`, or a package that cannot be imported.
 *
 * @param jiti - The stand-in to use.
 * @returns The function that uses the stand-in.
 */
async function importWithJiti(
  jiti: 'version 1' | 'version 2' | 'missing',
): Promise<typeof loadTypescriptConfig> {
  vi.resetModules()
  vi.doMock('jiti', () => {
    if (jiti === 'missing') {
      throw new Error('Cannot find package')
    }
    if (jiti === 'version 1') {
      return { createJiti: undefined, default: vi.fn() }
    }
    return {
      createJiti: () => ({
        import: vi.fn((id: string) =>
          Promise.resolve({ __esModule: true, default: id }),
        ),
      }),
    }
  })
  let { loadTypescriptConfig: load } =
    await import('../../../core/config/load-typescript-config')
  return load
}

/**
 * Writes a configuration file into a package of its own inside the test
 * directory.
 *
 * @param name - Path of the configuration file inside the package.
 * @param text - Contents of the file.
 * @param type - The `type` field of the package, or null to leave it out.
 * @returns Absolute path of the file.
 */
async function writePackageFile(
  name: string,
  text: string,
  type: string | null,
): Promise<string> {
  let root = await mkdtemp(path.join(directory, 'package-'))
  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify(type === null ? {} : { type }),
  )
  let file = path.join(root, name)
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, text)
  return file
}

describe('loadTypescriptConfig', () => {
  beforeAll(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'mootant-ts-config-'))
    await writeFile(path.join(directory, 'package.json'), '{"type":"module"}')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.doUnmock('jiti')
    vi.doUnmock('../../../core/config/import-config')
    vi.resetModules()
  })

  afterAll(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('imports the file when Node.js strips types', async () => {
    let file = path.join(directory, 'native.ts')
    await writeFile(
      file,
      "let preset: string = 'strict'\nexport default { extends: [preset] }\n",
    )
    vi.spyOn(process.features, 'typescript', 'get').mockReturnValue('strip')

    await expect(loadTypescriptConfig(file)).resolves.toStrictEqual({
      extends: ['strict'],
    })
  })

  it.each([
    ['config.ts', 'module', "export default { extends: ['strict'] }\n"],
    ['config.mts', 'commonjs', "export default { extends: ['strict'] }\n"],
    ['config.cts', 'commonjs', "module.exports = { extends: ['strict'] }\n"],
  ])(
    'imports %s of a "type": "%s" package directly when jiti is installed',
    async (name, type, text) => {
      let file = await writePackageFile(name, text, type)
      vi.spyOn(process.features, 'typescript', 'get').mockReturnValue('strip')
      let load = await importWithJiti('version 2')

      await expect(load(file)).resolves.toStrictEqual({ extends: ['strict'] })
    },
  )

  it('takes the package of a link from the file it points to', async () => {
    let target = await writePackageFile(
      'config.ts',
      "export default { extends: ['strict'] }\n",
      'module',
    )
    let link = await writePackageFile('mootant.config.ts', '', 'commonjs')
    await rm(link)
    await symlink(target, link)
    vi.spyOn(process.features, 'typescript', 'get').mockReturnValue('strip')
    let load = await importWithJiti('version 2')

    await expect(load(link)).resolves.toStrictEqual({ extends: ['strict'] })
  })

  it.each(['strip', false] as const)(
    'gives jiti the file a link points to (%s)',
    async typescript => {
      let target = await writePackageFile(
        'config.ts',
        'export default {}\n',
        null,
      )
      let link = await writePackageFile('mootant.config.ts', '', 'module')
      await rm(link)
      await symlink(target, link)
      vi.spyOn(process.features, 'typescript', 'get').mockReturnValue(
        typescript,
      )
      let load = await importWithJiti('version 2')

      await expect(load(link)).resolves.toBe(await realpath(target))
    },
  )

  it('takes the type of the nearest package.json above the file', async () => {
    let file = await writePackageFile(
      'configs/mootant.config.ts',
      "export default { extends: ['strict'] }\n",
      'module',
    )
    vi.spyOn(process.features, 'typescript', 'get').mockReturnValue('strip')
    let load = await importWithJiti('version 2')

    await expect(load(file)).resolves.toStrictEqual({ extends: ['strict'] })
  })

  it.each(['commonjs', null])(
    'loads a .ts file with jiti when the type of its package is %s',
    async type => {
      let file = await writePackageFile(
        'mootant.config.ts',
        'export default {}\n',
        type,
      )
      vi.spyOn(process.features, 'typescript', 'get').mockReturnValue('strip')
      let load = await importWithJiti('version 2')

      await expect(load(file)).resolves.toBe(await realpath(file))
    },
  )

  it.each(['missing', 'version 1'] as const)(
    'imports a .ts file of a CommonJS package when jiti is %s',
    async jiti => {
      let file = await writePackageFile(
        'mootant.config.ts',
        "module.exports = { extends: ['strict'] }\n",
        'commonjs',
      )
      vi.spyOn(process.features, 'typescript', 'get').mockReturnValue('strip')
      let load = await importWithJiti(jiti)

      await expect(load(file)).resolves.toStrictEqual({ extends: ['strict'] })
    },
  )

  it.each([
    [
      'Cannot use import statement outside a module',
      "import { defineConfig } from 'mootant'\n\nexport default defineConfig({})\n",
    ],
    ["Unexpected token 'export'", 'export default {}\n'],
  ])(
    'tells how to load a .ts file of a CommonJS package that fails with "%s"',
    async (message, text) => {
      let file = await writePackageFile('mootant.config.ts', text, 'commonjs')
      let error = new SyntaxError(message)
      vi.doMock('../../../core/config/import-config', () => ({
        importConfig: vi.fn().mockRejectedValue(error),
      }))
      vi.spyOn(process.features, 'typescript', 'get').mockReturnValue('strip')
      let load = await importWithJiti('missing')
      let loading = load(file)

      await expect(loading).rejects.toThrow(
        `${message}. Node.js reads the file as CommonJS because its package.json has "type": "commonjs"; to use import and export, install jiti or rename it to mootant.config.mts.`,
      )
      await expect(loading).rejects.toHaveProperty('cause', error)
    },
  )

  it.each([
    [
      'commonjs',
      Object.assign(
        new SyntaxError('TypeScript enum is not supported in strip-only mode'),
        { code: 'ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX' },
      ),
    ],
    ['commonjs', new Error('Cannot find module')],
    [null, new SyntaxError("Identifier 'a' has already been declared")],
  ])(
    'keeps the error of a .ts file in a package of type %s: %s',
    async (type, error) => {
      let file = await writePackageFile(
        'mootant.config.ts',
        'export default {}\n',
        type,
      )
      vi.doMock('../../../core/config/import-config', () => ({
        importConfig: vi.fn().mockRejectedValue(error),
      }))
      vi.spyOn(process.features, 'typescript', 'get').mockReturnValue('strip')
      let load = await importWithJiti('missing')

      await expect(load(file)).rejects.toBe(error)
    },
  )

  it('loads the file with jiti when Node.js cannot strip types', async () => {
    let file = path.join(directory, 'jiti.ts')
    await writeFile(
      file,
      "let preset: string = 'strict'\nexport default { extends: [preset] }\n",
    )
    vi.spyOn(process.features, 'typescript', 'get').mockReturnValue(false)

    await expect(loadTypescriptConfig(file)).resolves.toStrictEqual({
      extends: ['strict'],
    })
  })

  it.each([
    ['strip', 'native'],
    [false, 'jiti'],
  ] as const)(
    'reads no configuration from a file without a default export (%s)',
    async (typescript, name) => {
      let file = path.join(directory, `${name}-named.ts`)
      await writeFile(
        file,
        "export let mutators = { 'string-literal': 'off' }\n",
      )
      vi.spyOn(process.features, 'typescript', 'get').mockReturnValue(
        typescript,
      )

      await expect(loadTypescriptConfig(file)).resolves.toBeUndefined()
    },
  )

  it.each([
    ['strip', 'native'],
    [false, 'jiti'],
  ] as const)(
    'reads module.exports of a CommonJS file (%s)',
    async (typescript, name) => {
      let file = path.join(directory, `${name}-common.cts`)
      await writeFile(file, "module.exports = { extends: ['strict'] }\n")
      vi.spyOn(process.features, 'typescript', 'get').mockReturnValue(
        typescript,
      )

      await expect(loadTypescriptConfig(file)).resolves.toStrictEqual({
        extends: ['strict'],
      })
    },
  )

  it.each([
    ['mootant.config.ts', 'missing', 'module'],
    ['mootant.config.ts', 'missing', 'commonjs'],
    ['mootant.config.ts', 'version 1', 'commonjs'],
    ['mootant.config.cts', 'missing', 'commonjs'],
  ] as const)(
    'explains what is missing for %s when jiti is %s in a "type": "%s" package',
    async (name, jiti, type) => {
      let file = await writePackageFile(name, 'export default {}\n', type)
      vi.spyOn(process.features, 'typescript', 'get').mockReturnValue(false)
      let load = await importWithJiti(jiti)

      await expect(load(file)).rejects.toThrow(
        'TypeScript configuration files need Node.js 22.18 or later, or the jiti package.',
      )
    },
  )
})
