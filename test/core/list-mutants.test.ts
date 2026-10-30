import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { writeFile, realpath, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { GitRepository } from '../helpers/create-git-repository'
import type { Plugin } from '../../types/config/plugin'

import { installFakeFileSystem } from '../helpers/install-fake-file-system'
import { createGitRepository } from '../helpers/create-git-repository'
import { createMutantId } from '../../core/identity/create-mutant-id'
import { readChangedLines } from '../../core/git/read-changed-lines'
import { corePlugin } from '../../core/plugins/core-plugin'
import { loadConfig } from '../../core/config/load-config'
import { listMutants } from '../../core/list-mutants'

vi.mock(import('node:fs/promises'), async importOriginal => {
  let actual = await importOriginal()
  return {
    ...actual,
    realpath: vi.fn(actual.realpath) as never,
    readFile: vi.fn(actual.readFile) as never,
    readdir: vi.fn(actual.readdir) as never,
    stat: vi.fn(actual.stat) as never,
  }
})

vi.mock(
  import('../../core/identity/create-mutant-id'),
  async importOriginal => {
    let actual = await importOriginal()
    return { createMutantId: vi.fn(actual.createMutantId) }
  },
)

vi.mock(import('../../core/git/read-changed-lines'), async importOriginal => {
  let actual = await importOriginal()
  return { readChangedLines: vi.fn(actual.readChangedLines) }
})

vi.mock(import('../../core/config/load-config'), async importOriginal => {
  let actual = await importOriginal()
  return { loadConfig: vi.fn(actual.loadConfig) }
})

vi.mock(import('../../core/plugins/core-plugin'), async importOriginal => {
  let actual = await importOriginal()
  return { corePlugin: { ...actual.corePlugin } }
})

/**
 * Core plugin of the unit tests: one mutator that swaps a number for `2` and
 * skips its swap for `3`.
 */
const TEST_PLUGIN: Plugin = {
  mutators: {
    'number-swap': {
      create: () => ({
        Literal(node) {
          return [
            { text: '2', node },
            {
              skip: { reason: 'comparison owns it', rule: 'O4' },
              text: '3',
              node,
            },
          ]
        },
      }),
      meta: { description: 'Swaps a number.' },
    },
  },
  presets: {
    recommended: {
      description: 'Every test mutator.',
      mutators: { 'number-swap': 'on' },
    },
  },
}

describe('listMutants', () => {
  /**
   * Fields of the real core plugin, put back after each test.
   */
  let realPlugin = { ...corePlugin }

  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(loadConfig).mockResolvedValue(null)
    Object.assign(corePlugin, TEST_PLUGIN)
  })

  afterEach(() => {
    vi.resetAllMocks()
    Object.assign(corePlugin, realPlugin)
  })

  it('lists the mutants of every file in path order', async () => {
    installFakeFileSystem({
      '/repo/src/b.js': 'y = 3',
      '/repo/src/a.ts': 'x = 1',
    })

    let result = await listMutants({
      preset: 'recommended',
      paths: ['src'],
      cwd: '/repo',
    })

    expect(result.preset).toBe('recommended')
    expect(result.since).toBeNull()
    expect(readChangedLines).not.toHaveBeenCalled()
    expect(result.diagnostics).toStrictEqual([])
    expect(result.mutators.map(active => active.id)).toStrictEqual([
      'number-swap',
    ])
    expect(
      result.files.map(({ diagnostics, mutants, parsed, source, file }) => ({
        mutants: mutants.map(mutant => [mutant.start, mutant.replacement]),
        diagnostics,
        parsed,
        source,
        file,
      })),
    ).toStrictEqual([
      {
        mutants: [[4, '2']],
        file: 'src/a.ts',
        source: 'x = 1',
        diagnostics: [],
        parsed: true,
      },
      {
        mutants: [[4, '2']],
        file: 'src/b.js',
        source: 'y = 3',
        diagnostics: [],
        parsed: true,
      },
    ])
  })

  it('lists only the mutants and skipped candidates on lines changed since a revision', async () => {
    installFakeFileSystem({
      '/repo/src/a.ts': 'x = 1\ny = 5\nz = 3',
      '/repo/src/b.js': 'y = 3',
    })
    vi.mocked(readChangedLines).mockResolvedValue({
      files: new Map([['/repo/src/a.ts', new Set([2])]]),
      base: 'abc123',
    })

    let result = await listMutants({
      paths: ['src'],
      since: 'main',
      skipped: true,
      cwd: '/repo',
    })

    expect(readChangedLines).toHaveBeenCalledExactlyOnceWith('/repo', 'main')
    expect(result.since).toStrictEqual({ base: 'abc123', ref: 'main' })
    expect(
      result.files.map(({ mutants, skipped, file }) => ({
        skipped: skipped.map(candidate => candidate.start),
        mutants: mutants.map(mutant => mutant.start),
        file,
      })),
    ).toStrictEqual([{ file: 'src/a.ts', mutants: [10], skipped: [10] }])
  })

  it('writes paths and ids relative to the directory of the configuration', async () => {
    installFakeFileSystem({ '/repo/src/a.ts': 'x = 1' })
    vi.mocked(loadConfig).mockResolvedValue({
      config: { extends: ['recommended'] },
      file: '/repo/mootant.config.js',
      directory: '/repo',
    })

    let result = await listMutants({ cwd: '/repo/src', paths: ['a.ts'] })

    expect(loadConfig).toHaveBeenCalledExactlyOnceWith(undefined, '/repo/src')
    expect(result.preset).toBe('recommended')
    expect(result.files.map(({ file }) => file)).toStrictEqual(['src/a.ts'])
  })

  it.each([
    { skipped: undefined, count: 0 },
    { skipped: false, count: 0 },
    { skipped: true, count: 1 },
  ])(
    'collects skipped candidates only on request ($skipped)',
    async ({ skipped, count }) => {
      installFakeFileSystem({ '/repo/a.ts': 'x = 1' })

      let result = await listMutants({
        preset: 'recommended',
        paths: ['a.ts'],
        cwd: '/repo',
        skipped,
      })

      expect(result.skipped).toBe(skipped ?? false)
      expect(result.files[0]!.skipped).toHaveLength(count)
      expect(result.files[0]!.mutants).toHaveLength(1)
    },
  )

  it('rejects an unknown preset', async () => {
    installFakeFileSystem({ '/repo/a.ts': 'x = 1' })

    await expect(
      // spell-checker: disable-next-line
      listMutants({ preset: 'recomended', paths: ['a.ts'], cwd: '/repo' }),
    ).rejects.toThrow(
      // spell-checker: disable-next-line
      'Unknown preset "recomended". Did you mean "recommended"? Available presets: recommended.',
    )
  })

  it('rejects missing paths', async () => {
    installFakeFileSystem({ '/repo/a.ts': 'x = 1' })

    await expect(
      listMutants({ preset: 'recommended', paths: ['b.ts'], cwd: '/repo' }),
    ).rejects.toThrow('Path not found: b.ts.')
  })

  it('reports a file that cannot be read and lists the others', async () => {
    installFakeFileSystem({
      '/repo/locked.ts': { kind: 'unreadable-file' },
      '/repo/open.ts': 'x = 1',
    })

    let result = await listMutants({
      paths: ['locked.ts', 'open.ts'],
      preset: 'recommended',
      cwd: '/repo',
    })

    expect(result.files[0]).toStrictEqual({
      diagnostics: [
        {
          message: 'Cannot read the file (EACCES).',
          code: 'read-error',
          file: 'locked.ts',
          severity: 'error',
          column: null,
          line: null,
        },
      ],
      absolute: '/repo/locked.ts',
      file: 'locked.ts',
      parsed: false,
      source: null,
      skipped: [],
      mutants: [],
    })
    expect(result.files[1]!.mutants).toHaveLength(1)
    expect(result.files[1]!.absolute).toBe('/repo/open.ts')
  })

  it('reports a file that does not parse and lists the others', async () => {
    installFakeFileSystem({
      '/repo/broken.ts': 'let x = ;',
      '/repo/ok.ts': 'x = 1',
    })

    let result = await listMutants({
      paths: ['broken.ts', 'ok.ts'],
      preset: 'recommended',
      cwd: '/repo',
    })

    expect(result.files[0]).toMatchObject({
      file: 'broken.ts',
      parsed: false,
      mutants: [],
    })
    expect(result.files[0]!.diagnostics[0]!.code).toBe('parse-error')
    expect(result.files[1]!.mutants).toHaveLength(1)
  })

  it('rejects two mutants that share an id', async () => {
    installFakeFileSystem({ '/repo/a.ts': 'x = 1', '/repo/b.ts': 'y = 3' })
    // spell-checker: disable-next-line
    vi.mocked(createMutantId).mockReturnValue('w7019f5axk5g')

    await expect(
      listMutants({
        paths: ['a.ts', 'b.ts'],
        preset: 'recommended',
        cwd: '/repo',
      }),
    ).rejects.toThrow(
      // spell-checker: disable-next-line
      'Mutant id w7019f5axk5g is shared by a.ts:1:5 and b.ts:1:5. This is a hash collision; please report it.',
    )
  })
})

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

describe('listMutants with --since in a git repository', () => {
  let repository: GitRepository

  beforeEach(async () => {
    repository = await createGitRepository()
    let { write, git } = repository
    await write(
      'app/src/price.ts',
      [
        'export function total(price: number, count: number): number {',
        '  let sum = price * count',
        '  if (count > 10) {',
        '    sum = sum - 5',
        '  }',
        '  return sum',
        '}',
        '',
      ].join('\n'),
    )
    await write('app/src/name.ts', "export let name = 'cart'\n")
    await write('app/src/gone.ts', 'export let gone = 1 + 2\n')
    git('add', '.')
    git('commit', '--quiet', '-m', 'base')
    git('switch', '--quiet', '-c', 'feature')
  })

  afterEach(async () => {
    await repository.remove()
  })

  /**
   * Lists `src` of the app with `--since main` and gives each mutant as its
   * file, line of its start and original text.
   *
   * @returns Files with their mutants, and the revision of the run.
   */
  async function list(): Promise<{
    since: Awaited<ReturnType<typeof listMutants>>['since']
    mutants: string[]
    files: string[]
  }> {
    let result = await listMutants({
      cwd: path.join(repository.root, 'app'),
      paths: ['src'],
      since: 'main',
    })
    return {
      mutants: result.files.flatMap(file =>
        file.mutants.map(mutant => {
          let line = file.source!.slice(0, mutant.start).split('\n').length
          return `${file.file}:${line} ${file.source!.slice(mutant.start, mutant.end)}`
        }),
      ),
      files: result.files.map(file => file.file),
      since: result.since,
    }
  }

  it('lists the mutants on committed, staged and unstaged changes and in untracked files', async () => {
    let { write, root, git } = repository
    let base = git('rev-parse', 'HEAD').trim()
    await write(
      'app/src/price.ts',
      [
        'export function total(price: number, count: number): number {',
        '  let sum = price * count',
        '  if (count >= 10) {',
        '    sum = sum - 5',
        '  }',
        '  return sum',
        '}',
        '',
      ].join('\n'),
    )
    git('commit', '--quiet', '-am', 'feature')
    await rm(path.join(root, 'app/src/gone.ts'))
    await write('app/src/fresh.ts', 'export let fresh = 2 * 3\n')

    let listed = await list()

    expect(listed.since).toStrictEqual({ ref: 'main', base })
    expect(listed.files).toStrictEqual(['src/fresh.ts', 'src/price.ts'])
    expect(listed.mutants).toStrictEqual(
      expect.arrayContaining([
        'src/fresh.ts:1 2 * 3',
        'src/price.ts:3 count >= 10',
      ]),
    )
    expect(listed.mutants.filter(entry => entry.includes(':2 '))).toStrictEqual(
      [],
    )
    expect(listed.mutants.filter(entry => entry.includes(':4 '))).toStrictEqual(
      [],
    )
  })

  it('lists the mutants around a removed line and none without changes', async () => {
    let { write } = repository

    await expect(list()).resolves.toMatchObject({ mutants: [], files: [] })

    await write(
      'app/src/price.ts',
      [
        'export function total(price: number, count: number): number {',
        '  let sum = price * count',
        '  if (count > 10) {',
        '  }',
        '  return sum',
        '}',
        '',
      ].join('\n'),
    )

    let { mutants } = await list()

    expect(mutants).toStrictEqual(
      expect.arrayContaining(['src/price.ts:3 count > 10']),
    )
    expect(mutants.some(entry => entry.startsWith('src/price.ts:5 '))).toBe(
      false,
    )
  })
})
