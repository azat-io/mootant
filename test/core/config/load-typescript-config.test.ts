import {
  afterEach,
  beforeAll,
  afterAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { writeFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { loadTypescriptConfig } from '../../../core/config/load-typescript-config'

let directory = ''

describe('loadTypescriptConfig', () => {
  beforeAll(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'mootant-ts-config-'))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.doUnmock('jiti')
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

  it('explains what is missing when jiti is not installed', async () => {
    vi.doMock('jiti', () => {
      throw new Error('Cannot find package')
    })
    vi.spyOn(process.features, 'typescript', 'get').mockReturnValue(false)
    let { loadTypescriptConfig: load } =
      await import('../../../core/config/load-typescript-config')

    await expect(
      load(path.join(directory, 'mootant.config.ts')),
    ).rejects.toThrow(
      'Cannot load mootant.config.ts: TypeScript configuration files need Node.js 22.18 or later, or the jiti package.',
    )
  })
})
