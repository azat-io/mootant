import { realpath, readFile, readdir, stat } from 'node:fs/promises'
import { vi } from 'vitest'

import type { FakeEntry } from './create-fake-file-system'

import { createFakeFileSystem } from './create-fake-file-system'

/**
 * Serves the mocked `readFile`, `realpath`, `stat` and `readdir` of
 * `node:fs/promises` from an in-memory tree for the running test; the test file
 * mocks `node:fs/promises` with `vi.fn()` for the four functions.
 *
 * @param entries - Absolute paths mapped to file text or special entries.
 */
export function installFakeFileSystem(
  entries: Record<string, FakeEntry | string>,
): void {
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
