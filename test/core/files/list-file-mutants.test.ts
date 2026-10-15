import { readFile, realpath, readdir, stat } from 'node:fs/promises'
import { describe, expect, it, vi } from 'vitest'

import { createFakeFileSystem } from '../../helpers/create-fake-file-system'
import { listFileMutants } from '../../../core/files/list-file-mutants'
import { prepareRun } from '../../../core/config/prepare-run'

vi.mock(import('node:fs/promises'), () => ({
  realpath: vi.fn(),
  readFile: vi.fn(),
  readdir: vi.fn(),
  stat: vi.fn(),
}))

vi.mock(import('../../../core/config/load-config'), () => ({
  loadConfig: vi.fn().mockResolvedValue(null),
}))

describe('listFileMutants', () => {
  it('lists the mutants of every file with its real path', async () => {
    let fileSystem = createFakeFileSystem({
      '/repo/src/b.ts': 'let y = 2 + 3',
      '/repo/src/a.ts': 'let x = 1',
    })
    vi.mocked(readFile).mockImplementation(((path: string, options: 'utf8') =>
      fileSystem.readFile(path, options)) as typeof readFile)
    vi.mocked(realpath).mockImplementation(path => fileSystem.realpath(path))
    vi.mocked(stat).mockImplementation(path => fileSystem.stat(path))
    vi.mocked(readdir).mockImplementation(((
      path: string,
      options?: { withFileTypes?: boolean },
    ) => fileSystem.readdir(path, options)) as typeof readdir)
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
})
