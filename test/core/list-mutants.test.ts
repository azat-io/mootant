import { realpath, readFile, readdir, stat } from 'node:fs/promises'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { FakeEntry } from '../helpers/create-fake-file-system'
import type { Plugin } from '../../types/plugin'

import { createFakeFileSystem } from '../helpers/create-fake-file-system'
import { createMutantId } from '../../core/identity/create-mutant-id'
import { listMutants } from '../../core/list-mutants'

vi.mock(import('node:fs/promises'), () => ({
  realpath: vi.fn(),
  readFile: vi.fn(),
  readdir: vi.fn(),
  stat: vi.fn(),
}))

vi.mock(
  import('../../core/identity/create-mutant-id'),
  async importOriginal => {
    let actual = await importOriginal()
    return { createMutantId: vi.fn(actual.createMutantId) }
  },
)

vi.mock(import('../../core/plugins/core-plugin'), () => {
  let corePlugin: Plugin = {
    mutators: {
      'number-swap': {
        create: () => ({
          Literal(node) {
            return [{ text: '2', node }]
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
  return { corePlugin }
})

/**
 * Serves `readFile`, `realpath`, `stat` and `readdir` from an in-memory tree
 * for the running test.
 *
 * @param entries - Absolute paths mapped to file text or special entries.
 */
function installFileSystem(entries: Record<string, FakeEntry | string>): void {
  let fileSystem = createFakeFileSystem(entries)
  vi.mocked(readFile).mockImplementation(((path: string, options: 'utf8') =>
    fileSystem.readFile(path, options)) as typeof readFile)
  vi.mocked(realpath).mockImplementation(path => fileSystem.realpath(path))
  vi.mocked(stat).mockImplementation(path => fileSystem.stat(path))
  vi.mocked(readdir).mockImplementation(((
    path: string,
    options?: { withFileTypes?: boolean },
  ) => fileSystem.readdir(path, options)) as typeof readdir)
}

describe('listMutants', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('lists the mutants of every file in path order', async () => {
    installFileSystem({
      '/repo/src/b.js': 'y = 3',
      '/repo/src/a.ts': 'x = 1',
    })

    let result = await listMutants({
      preset: 'recommended',
      paths: ['src'],
      cwd: '/repo',
    })

    expect(result.preset).toBe('recommended')
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

  it('rejects an unknown preset', async () => {
    installFileSystem({ '/repo/a.ts': 'x = 1' })

    await expect(
      // spell-checker: disable-next-line
      listMutants({ preset: 'recomended', paths: ['a.ts'], cwd: '/repo' }),
    ).rejects.toThrow(
      // spell-checker: disable-next-line
      'Unknown preset "recomended". Did you mean "recommended"? Available presets: recommended.',
    )
  })

  it('rejects missing paths', async () => {
    installFileSystem({ '/repo/a.ts': 'x = 1' })

    await expect(
      listMutants({ preset: 'recommended', paths: ['b.ts'], cwd: '/repo' }),
    ).rejects.toThrow('Path not found: b.ts.')
  })

  it('reports a file that cannot be read and lists the others', async () => {
    installFileSystem({
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
      file: 'locked.ts',
      parsed: false,
      source: null,
      mutants: [],
    })
    expect(result.files[1]!.mutants).toHaveLength(1)
  })

  it('reports a file that does not parse and lists the others', async () => {
    installFileSystem({
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
    installFileSystem({ '/repo/a.ts': 'x = 1', '/repo/b.ts': 'y = 3' })
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
