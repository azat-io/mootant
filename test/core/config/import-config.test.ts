import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { writeFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { importConfig } from '../../../core/config/import-config'

let directory = ''

describe('importConfig', () => {
  beforeAll(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'mootant-import-config-'))
  })

  afterAll(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('reads the default export of an ES module', async () => {
    let file = path.join(directory, 'default.mjs')
    await writeFile(file, 'export default { a: 1 }\nexport let b = 2\n')

    await expect(importConfig(file)).resolves.toStrictEqual({ a: 1 })
  })

  it('reads module.exports of a CommonJS module', async () => {
    let file = path.join(directory, 'common.cjs')
    await writeFile(file, 'module.exports = { a: 1 }\n')

    await expect(importConfig(file)).resolves.toStrictEqual({ a: 1 })
  })

  it('reads nothing from a module without a default export', async () => {
    let file = path.join(directory, 'named.mjs')
    await writeFile(file, 'export let mutators = {}\n')

    await expect(importConfig(file)).resolves.toBeUndefined()
  })
})
