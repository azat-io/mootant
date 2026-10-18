import { writeFile, mkdtemp, mkdir, rm } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { pathToFileURL } from 'node:url'
import { realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { resolveTsx } from '../../../adapters/node-test/resolve-tsx'

describe('resolveTsx', () => {
  it("finds the loader of the project's tsx, or null", async () => {
    let root = realpathSync(await mkdtemp(path.join(tmpdir(), 'mootant-tsx-')))

    expect(resolveTsx(root)).toBeNull()

    let directory = path.join(root, 'node_modules', 'tsx')
    await mkdir(path.join(directory, 'dist'), { recursive: true })
    await writeFile(
      path.join(directory, 'package.json'),
      JSON.stringify({ exports: { '.': './dist/loader.mjs' }, name: 'tsx' }),
    )
    await writeFile(path.join(directory, 'dist', 'loader.mjs'), '')

    expect(resolveTsx(root)).toBe(
      pathToFileURL(path.join(directory, 'dist', 'loader.mjs')).href,
    )

    await rm(root, { recursive: true })
  })
})
