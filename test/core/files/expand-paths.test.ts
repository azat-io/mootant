import { beforeEach, describe, expect, it, vi } from 'vitest'
import { realpath, readdir, stat } from 'node:fs/promises'

import type { FakeEntry } from '../../helpers/create-fake-file-system'

import { createFakeFileSystem } from '../../helpers/create-fake-file-system'
import { expandPaths } from '../../../core/files/expand-paths'

vi.mock(import('node:fs/promises'), () => ({
  realpath: vi.fn(),
  readdir: vi.fn(),
  stat: vi.fn(),
}))

/**
 * Serves `realpath`, `stat` and `readdir` from an in-memory tree for the
 * running test.
 *
 * @param entries - Absolute paths mapped to file text or special entries.
 */
function installFileSystem(entries: Record<string, FakeEntry | string>): void {
  let fileSystem = createFakeFileSystem(entries)
  vi.mocked(realpath).mockImplementation(path => fileSystem.realpath(path))
  vi.mocked(stat).mockImplementation(path => fileSystem.stat(path))
  vi.mocked(readdir).mockImplementation(((
    path: string,
    options?: { withFileTypes?: boolean },
  ) => fileSystem.readdir(path, options)) as typeof readdir)
}

/**
 * Builds a skipped-path warning.
 *
 * @param message - Sentence of the warning.
 * @returns Warning without a file or position.
 */
function skipped(message: string): object {
  return {
    code: 'skipped-path',
    severity: 'warning',
    column: null,
    file: null,
    line: null,
    message,
  }
}

/**
 * Symbolic link entry.
 *
 * @param target - Absolute path the link points to.
 * @returns Link entry of the fake file system.
 */
function link(target: string): FakeEntry {
  return { kind: 'symlink', target }
}

describe('expandPaths', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('lists an explicit file with its real and display paths', async () => {
    installFileSystem({ '/repo/src/a.ts': '' })

    await expect(expandPaths(['src/a.ts'], '/repo')).resolves.toStrictEqual({
      files: [{ absolute: '/repo/src/a.ts', file: 'src/a.ts' }],
      diagnostics: [],
    })
  })

  it('walks a directory and keeps only source files', async () => {
    installFileSystem({
      '/repo/src/node_modules/package/index.js': '',
      '/repo/src/link.ts': link('/repo/lib/b.ts'),
      '/repo/src/socket.ts': { kind: 'socket' },
      '/repo/src/linked': link('/repo/lib'),
      '/repo/src/nested/Card.svelte': '',
      '/repo/src/nested/deep/d.cts': '',
      '/repo/src/.hidden/hidden.ts': '',
      '/repo/src/pages/index.astro': '',
      '/repo/src/nested/c.tsx': '',
      '/repo/src/.eslintrc.js': '',
      '/repo/src/styles.css': '',
      '/repo/src/types.d.ts': '',
      '/repo/src/readme.md': '',
      '/repo/src/App.vue': '',
      '/repo/src/e.mjs': '',
      '/repo/lib/b.ts': '',
      '/repo/src/a.ts': '',
      '/repo/src/F.js': '',
    })

    let { diagnostics, files } = await expandPaths(['src'], '/repo')

    expect(files.map(({ file }) => file)).toStrictEqual([
      'src/App.vue',
      'src/F.js',
      'src/a.ts',
      'src/e.mjs',
      'src/nested/Card.svelte',
      'src/nested/c.tsx',
      'src/nested/deep/d.cts',
      'src/pages/index.astro',
    ])
    expect(diagnostics).toStrictEqual([])
  })

  it('walks the directories given on the command line even when they are skipped in walks', async () => {
    installFileSystem({
      '/repo/node_modules/package/index.js': '',
      '/repo/.config/settings.ts': '',
    })

    let { files } = await expandPaths(
      ['.config', 'node_modules/package'],
      '/repo',
    )

    expect(files).toStrictEqual([
      { absolute: '/repo/.config/settings.ts', file: '.config/settings.ts' },
      {
        absolute: '/repo/node_modules/package/index.js',
        file: 'node_modules/package/index.js',
      },
    ])
  })

  it('warns about an unreadable directory and keeps walking', async () => {
    installFileSystem({
      '/repo/src/locked': { kind: 'unreadable-directory' },
      '/repo/src/a.ts': '',
    })

    await expect(expandPaths(['src'], '/repo')).resolves.toStrictEqual({
      diagnostics: [
        skipped('Skipped src/locked: cannot read the directory (EACCES).'),
      ],
      files: [{ absolute: '/repo/src/a.ts', file: 'src/a.ts' }],
    })
  })

  it('names the working directory "." when it cannot be read', async () => {
    installFileSystem({
      '/repo': { kind: 'unreadable-directory' },
      '/other/a.ts': '',
    })

    await expect(
      expandPaths(['.', '../other/a.ts'], '/repo'),
    ).resolves.toStrictEqual({
      diagnostics: [skipped('Skipped .: cannot read the directory (EACCES).')],
      files: [{ absolute: '/other/a.ts', file: '../other/a.ts' }],
    })
  })

  it.each([
    [
      'readme.md',
      'Skipped readme.md: not a JavaScript or TypeScript source file.',
    ],
    [
      'types.d.ts',
      'Skipped types.d.ts: declaration files have nothing to mutate.',
    ],
    [
      'styles.D.CSS.TS',
      'Skipped styles.D.CSS.TS: declaration files have nothing to mutate.',
    ],
    [
      'socket.d.ts',
      'Skipped socket.d.ts: not a JavaScript or TypeScript source file.',
    ],
  ])('warns about the explicit path %s', async (input, message) => {
    installFileSystem({
      '/repo/socket.d.ts': { kind: 'socket' },
      '/repo/styles.D.CSS.TS': '',
      '/repo/types.d.ts': '',
      '/repo/readme.md': '',
      '/repo/a.ts': '',
    })

    await expect(expandPaths([input, 'a.ts'], '/repo')).resolves.toStrictEqual({
      files: [{ absolute: '/repo/a.ts', file: 'a.ts' }],
      diagnostics: [skipped(message)],
    })
  })

  it('lists a file once when it is named through a link, another letter case and a directory', async () => {
    installFileSystem({
      '/repo/link.ts': link('/repo/src/a.ts'),
      '/repo/src/a.ts': '',
    })

    await expect(
      expandPaths(['src/a.ts', 'SRC/A.TS', 'link.ts', 'src'], '/repo'),
    ).resolves.toStrictEqual({
      files: [{ absolute: '/repo/src/a.ts', file: 'src/a.ts' }],
      diagnostics: [],
    })
  })

  it('resolves links in the working directory and in the middle of a path', async () => {
    installFileSystem({
      '/repo/linked': link('/repo/src'),
      '/home/project': link('/repo'),
      '/repo/src/a.ts': '',
    })

    await expect(
      expandPaths(['linked/a.ts'], '/home/project'),
    ).resolves.toStrictEqual({
      files: [{ absolute: '/repo/src/a.ts', file: 'src/a.ts' }],
      diagnostics: [],
    })
  })

  it('normalizes display paths to NFC', async () => {
    let decomposed = 'cafe\u{301}.ts'
    installFileSystem({ [`/repo/src/${decomposed}`]: '' })

    await expect(expandPaths(['src'], '/repo')).resolves.toStrictEqual({
      files: [{ absolute: `/repo/src/${decomposed}`, file: 'src/café.ts' }],
      diagnostics: [],
    })
  })

  it('keeps parent segments for files outside the working directory', async () => {
    installFileSystem({ '/repo/lib/a.ts': '', '/repo/app/b.ts': '' })

    let { files } = await expandPaths(['../lib/a.ts', 'b.ts'], '/repo/app')

    expect(files.map(({ file }) => file)).toStrictEqual(['../lib/a.ts', 'b.ts'])
  })

  it.each([
    [['missing.ts', 'a.ts'], 'Path not found: missing.ts.'],
    [
      ['src/missing.ts', 'a.ts', 'lib'],
      'Paths not found: src/missing.ts, lib.',
    ],
    [['a.ts/b.ts'], 'Path not found: a.ts/b.ts.'],
    [
      ['src/*.ts'],
      'Path not found: src/*.ts. Mootant does not expand glob patterns; let the shell expand them or pass a directory.',
    ],
    [
      ['lib', 'src/{a,b}.ts'],
      'Paths not found: lib, src/{a,b}.ts. Mootant does not expand glob patterns; let the shell expand them or pass a directory.',
    ],
  ])('throws for the missing paths of %j', async (inputs, message) => {
    installFileSystem({ '/repo/a.ts': '' })

    await expect(expandPaths(inputs, '/repo')).rejects.toThrow(
      new Error(message),
    )
  })

  it.each([
    [['missing.ts', 'locked/a.ts'], 'Cannot access locked/a.ts (EACCES).'],
    [['loop.ts'], 'Cannot access loop.ts (ELOOP).'],
  ])('throws for the inaccessible path in %j', async (inputs, message) => {
    installFileSystem({
      '/repo/locked': { kind: 'unreadable-directory' },
      '/repo/loop.ts': link('/repo/loop.ts'),
    })

    await expect(expandPaths(inputs, '/repo')).rejects.toThrow(
      new Error(message),
    )
  })

  it('throws when no source file is found', async () => {
    installFileSystem({ '/repo/docs/guide.md': '', '/repo/readme.md': '' })

    await expect(expandPaths(['docs', 'readme.md'], '/repo')).rejects.toThrow(
      new Error('No JavaScript or TypeScript files found in docs, readme.md.'),
    )
  })
})
