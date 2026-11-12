import { writeFile, mkdtemp, rm } from 'node:fs/promises'
import { afterEach, describe, expect, it } from 'vitest'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { readPackageType } from '../../../adapters/shared/read-package-type'

/**
 * Directory of the current test.
 */
let directory = ''

describe('readPackageType', () => {
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('reads the type field once per file', async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'mootant-package-type-'))
    let file = path.join(directory, 'package.json')
    let cache = new Map<string, unknown>()
    await writeFile(file, '{"type":"module"}')

    expect(readPackageType(file, cache)).toBe('module')

    await writeFile(file, '{"type":"commonjs"}')

    expect(readPackageType(file, cache)).toBe('module')
    expect(readPackageType(file, new Map())).toBe('commonjs')
  })

  it('gives null for a missing field or an unreadable file', async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'mootant-package-type-'))
    let file = path.join(directory, 'package.json')
    await writeFile(file, '{}')

    expect(readPackageType(file, new Map())).toBeNull()
    expect(
      readPackageType(path.join(directory, 'missing.json'), new Map()),
    ).toBeNull()

    await writeFile(file, '{')

    expect(readPackageType(file, new Map())).toBeNull()
  })
})
