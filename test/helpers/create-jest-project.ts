import { realpath, mkdtemp, symlink, mkdir, cp } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import path from 'node:path'

/**
 * Copies a Jest fixture to a temporary directory outside the repository, where
 * only the symlinks made here resolve `jest`, which also gives it the layout of
 * strict pnpm.
 *
 * @param name - Directory of the fixture under `test/fixtures/jest`.
 * @param major - Major version of Jest the project gets.
 * @returns Real path of the copy, which the caller removes.
 */
export async function createJestProject(
  name: string,
  major: 29 | 30,
): Promise<string> {
  let root = await realpath(await mkdtemp(path.join(tmpdir(), 'mootant-jest-')))
  await cp(path.resolve(import.meta.dirname, '../fixtures/jest', name), root, {
    recursive: true,
  })
  let links = {
    'jest-environment-jsdom':
      major === 30 ?
        import.meta.resolve('jest-environment-jsdom/package.json')
      : import.meta.resolve('jest-environment-jsdom-29/package.json'),
    jest:
      major === 30 ?
        import.meta.resolve('jest/package.json')
      : import.meta.resolve('jest-29/package.json'),
  }
  await mkdir(path.join(root, 'node_modules'))
  await Promise.all(
    Object.entries(links).map(([link, manifest]) =>
      symlink(
        path.dirname(fileURLToPath(manifest)),
        path.join(root, 'node_modules', link),
      ),
    ),
  )
  return root
}
