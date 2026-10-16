import { readFile, realpath, readdir, stat } from 'node:fs/promises'
import { describe, expect, it, vi } from 'vitest'

import { loadSvelteCompiler } from '../../../core/parser/load-svelte-compiler'
import { createFakeFileSystem } from '../../helpers/create-fake-file-system'
import { loadVueCompiler } from '../../../core/parser/load-vue-compiler'
import { listFileMutants } from '../../../core/files/list-file-mutants'
import { prepareRun } from '../../../core/config/prepare-run'

vi.mock(import('node:fs/promises'), () => ({
  realpath: vi.fn(),
  readFile: vi.fn(),
  readdir: vi.fn(),
  stat: vi.fn(),
}))

vi.mock(
  import('../../../core/parser/load-svelte-compiler'),
  async importOriginal => {
    let original = await importOriginal()
    return { loadSvelteCompiler: vi.fn(original.loadSvelteCompiler) }
  },
)

vi.mock(
  import('../../../core/parser/load-vue-compiler'),
  async importOriginal => {
    let original = await importOriginal()
    return { loadVueCompiler: vi.fn(original.loadVueCompiler) }
  },
)

vi.mock(import('../../../core/config/load-config'), () => ({
  loadConfig: vi.fn().mockResolvedValue(null),
}))

/**
 * Serves the files of a fake file system to the mocked file functions.
 *
 * @param files - Text of every file by absolute path.
 */
function useFiles(files: Record<string, string>): void {
  let fileSystem = createFakeFileSystem(files)
  vi.mocked(readFile).mockImplementation(((path: string, options: 'utf8') =>
    fileSystem.readFile(path, options)) as typeof readFile)
  vi.mocked(realpath).mockImplementation(path => fileSystem.realpath(path))
  vi.mocked(stat).mockImplementation(path => fileSystem.stat(path))
  vi.mocked(readdir).mockImplementation(((
    path: string,
    options?: { withFileTypes?: boolean },
  ) => fileSystem.readdir(path, options)) as typeof readdir)
}

describe('listFileMutants', () => {
  it('lists the mutants of every file with its real path', async () => {
    useFiles({
      '/repo/src/b.ts': 'let y = 2 + 3',
      '/repo/src/a.ts': 'let x = 1',
    })
    let setup = await prepareRun({ cwd: '/repo' })

    let listed = await listFileMutants({
      knownMutatorIds: setup.knownMutatorIds,
      settings: setup.settings,
      mutators: setup.mutators,
      paths: ['src'],
      skipped: false,
      root: '/repo',
      cwd: '/repo',
    })

    expect(listed.diagnostics).toStrictEqual([])
    expect(
      listed.files.map(file => [
        file.file,
        file.absolute,
        file.mutants.length > 0,
      ]),
    ).toStrictEqual([
      ['src/a.ts', '/repo/src/a.ts', true],
      ['src/b.ts', '/repo/src/b.ts', true],
    ])
  })
  it.each([
    {
      scopes: [null, '<template>'],
      name: 'mutates templates',
      templates: true,
    },
    { name: 'leaves templates alone', templates: false, scopes: [null] },
  ])(
    '$name of Svelte components by the setting',
    async ({ templates, scopes }) => {
      useFiles({
        '/repo/src/a.svelte': '<script>x = 1</script>\n<p>{y + 2}</p>',
      })
      let setup = await prepareRun({ cwd: '/repo' })
      vi.mocked(loadSvelteCompiler).mockClear()

      let listed = await listFileMutants({
        settings: { ...setup.settings, templates },
        knownMutatorIds: setup.knownMutatorIds,
        mutators: setup.mutators,
        paths: ['src'],
        skipped: false,
        root: '/repo',
        cwd: '/repo',
      })

      expect(listed.diagnostics).toStrictEqual([])
      expect([
        ...new Set(listed.files[0]!.mutants.map(mutant => mutant.scope)),
      ]).toStrictEqual(scopes)
      expect(loadSvelteCompiler).toHaveBeenCalledTimes(templates ? 1 : 0)
    },
  )

  it('warns once when the Svelte compiler cannot be loaded', async () => {
    useFiles({
      '/repo/src/a.svelte': '<p>{y + 2}</p>',
      '/repo/src/b.svelte': '<p>{y - 2}</p>',
    })
    let setup = await prepareRun({ cwd: '/repo' })
    vi.mocked(loadSvelteCompiler).mockResolvedValueOnce(null)

    let listed = await listFileMutants({
      knownMutatorIds: setup.knownMutatorIds,
      settings: setup.settings,
      mutators: setup.mutators,
      paths: ['src'],
      skipped: false,
      root: '/repo',
      cwd: '/repo',
    })

    expect(listed.diagnostics).toStrictEqual([
      {
        message:
          'Svelte templates are not mutated, because the svelte package, version 5 or later, cannot be loaded. Install it, or set "templates" to false to hide this warning.',
        code: 'template-skipped',
        severity: 'warning',
        column: null,
        line: null,
        file: null,
      },
    ])
    expect(listed.files.flatMap(file => file.mutants)).toStrictEqual([])
  })

  it('reads Vue templates and warns when their compiler cannot be loaded', async () => {
    useFiles({ '/repo/src/a.vue': '<template>{{ y + 2 }}</template>' })
    let setup = await prepareRun({ cwd: '/repo' })
    let options = {
      knownMutatorIds: setup.knownMutatorIds,
      settings: setup.settings,
      mutators: setup.mutators,
      paths: ['src'],
      skipped: false,
      root: '/repo',
      cwd: '/repo',
    }

    let listed = await listFileMutants(options)

    expect(listed.diagnostics).toStrictEqual([])
    expect(listed.files[0]!.mutants.map(mutant => mutant.scope)).toContain(
      '<template>',
    )

    vi.mocked(loadVueCompiler).mockResolvedValueOnce(null)

    expect((await listFileMutants(options)).diagnostics).toStrictEqual([
      {
        message:
          'Vue templates are not mutated, because the @vue/compiler-dom package, version 3.5 or later, cannot be loaded. Install it, or set "templates" to false to hide this warning.',
        code: 'template-skipped',
        severity: 'warning',
        column: null,
        line: null,
        file: null,
      },
    ])
  })
})
