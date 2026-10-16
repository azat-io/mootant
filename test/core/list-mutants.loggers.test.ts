import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import { writeFile, realpath, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { listMutants } from '../../core/list-mutants'

describe('listMutants with the loggers setting', () => {
  let directory: string

  beforeEach(async () => {
    directory = await realpath(
      await mkdtemp(path.join(tmpdir(), 'mootant-loggers-')),
    )
    await writeFile(
      path.join(directory, 'app.ts'),
      [
        "consola.info('x')",
        "consola.withTag('Build')",
        "logger.info('y')",
      ].join('\n'),
    )
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  /**
   * Lists the mutants of `app.ts` with a configuration file in the directory.
   *
   * @param settings - Settings of the configuration file.
   * @returns Ids of the mutants and their changes, as `original ->
   *   replacement`.
   */
  async function list(
    settings: object,
  ): Promise<{ changes: string[]; ids: string[] }> {
    await writeFile(
      path.join(directory, '.mootantrc.json'),
      JSON.stringify({ settings }),
    )
    let { files } = await listMutants({ paths: ['app.ts'], cwd: directory })
    let { mutants, source } = files[0]!
    return {
      changes: mutants.map(
        mutant =>
          `${source!.slice(mutant.start, mutant.end)} -> ${mutant.replacement}`,
      ),
      ids: mutants.map(mutant => mutant.id),
    }
  }

  it('mutates the arguments of consola calls by default', async () => {
    let { changes } = await list({})

    expect(changes).toStrictEqual(["'x' -> ''", "'Build' -> ''"])
  })

  it('leaves the consola log text and tag alone when the setting names consola', async () => {
    let { changes } = await list({ loggers: ['consola'] })

    expect(changes).toStrictEqual(["consola.withTag('Build') -> ;"])
  })

  it('keeps the mutants and ids when the setting names no receiver of the file', async () => {
    let without = await list({})
    let unrelated = await list({ loggers: ['signale'] })

    expect(unrelated).toStrictEqual(without)
  })
})
