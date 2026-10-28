import { describe, expect, it, vi } from 'vitest'

import type { PresetSettings } from '../../../types/config/preset-settings'

import { loadSvelteCompiler } from '../../../core/parser/load-svelte-compiler'
import { installFakeFileSystem } from '../../helpers/install-fake-file-system'
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
 * Lists the mutants of `/repo/src` as a run from `/repo` would, with settings
 * over those of its preset.
 *
 * @param settings - Settings that differ from those of the preset.
 * @returns Mutants of every file and warnings of the listing.
 */
async function listSource(
  settings: Partial<PresetSettings> = {},
): ReturnType<typeof listFileMutants> {
  let setup = await prepareRun({ cwd: '/repo' })
  return listFileMutants({
    settings: { ...setup.settings, ...settings },
    knownMutatorIds: setup.knownMutatorIds,
    mutators: setup.mutators,
    paths: ['src'],
    skipped: false,
    root: '/repo',
    cwd: '/repo',
  })
}

describe('listFileMutants', () => {
  it('lists the mutants of every file with its real path', async () => {
    installFakeFileSystem({
      '/repo/src/b.ts': 'let y = 2 + 3',
      '/repo/src/a.ts': 'let x = 1',
    })

    let listed = await listSource()

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
      installFakeFileSystem({
        '/repo/src/a.svelte': '<script>x = 1</script>\n<p>{y + 2}</p>',
      })
      vi.mocked(loadSvelteCompiler).mockClear()

      let listed = await listSource({ templates })

      expect(listed.diagnostics).toStrictEqual([])
      expect([
        ...new Set(listed.files[0]!.mutants.map(mutant => mutant.scope)),
      ]).toStrictEqual(scopes)
      expect(loadSvelteCompiler).toHaveBeenCalledTimes(templates ? 1 : 0)
    },
  )

  it('warns once when the Svelte compiler cannot be loaded', async () => {
    installFakeFileSystem({
      '/repo/src/a.svelte': '<p>{y + 2}</p>',
      '/repo/src/b.svelte': '<p>{y - 2}</p>',
    })
    vi.mocked(loadSvelteCompiler).mockResolvedValueOnce(null)

    let listed = await listSource()

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
    installFakeFileSystem({
      '/repo/src/a.vue': '<template>{{ y + 2 }}</template>',
    })

    let listed = await listSource()

    expect(listed.diagnostics).toStrictEqual([])
    expect(listed.files[0]!.mutants.map(mutant => mutant.scope)).toContain(
      '<template>',
    )

    vi.mocked(loadVueCompiler).mockResolvedValueOnce(null)

    expect((await listSource()).diagnostics).toStrictEqual([
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
