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
   * @returns Ids of the mutants, their changes and the changes skipped as log
   *   messages, as `original -> replacement`.
   */
  async function list(
    settings: object,
  ): Promise<{ messages: string[]; changes: string[]; ids: string[] }> {
    await writeFile(
      path.join(directory, '.mootantrc.json'),
      JSON.stringify({ settings }),
    )
    let { files } = await listMutants({
      paths: ['app.ts'],
      cwd: directory,
      skipped: true,
    })
    let { mutants, skipped, source } = files[0]!
    return {
      messages: skipped
        .filter(candidate => candidate.rule === 'log-message')
        .map(
          candidate =>
            `${source!.slice(candidate.start, candidate.end)} -> ${candidate.replacement}`,
        ),
      changes: mutants.map(
        mutant =>
          `${source!.slice(mutant.start, mutant.end)} -> ${mutant.replacement}`,
      ),
      ids: mutants.map(mutant => mutant.id),
    }
  }

  it('skips the messages of the default loggers and mutates consola calls as code', async () => {
    let { messages, changes } = await list({})

    expect(changes).toStrictEqual([
      "'x' -> ''",
      "'Build' -> ''",
      "logger.info('y') -> ;",
    ])
    expect(messages).toStrictEqual(["'y' -> ''"])
  })

  it('skips only the messages of the loggers the setting names and leaves their labels alone', async () => {
    let { messages, changes } = await list({ loggers: ['consola'] })

    expect(changes).toStrictEqual([
      "consola.info('x') -> ;",
      "consola.withTag('Build') -> ;",
      "'y' -> ''",
    ])
    expect(messages).toStrictEqual(["'x' -> ''"])
  })

  it('mutates every call as code with an empty setting', async () => {
    let { messages, changes } = await list({ loggers: [] })

    expect(changes).toStrictEqual(["'x' -> ''", "'Build' -> ''", "'y' -> ''"])
    expect(messages).toStrictEqual([])
  })
})
