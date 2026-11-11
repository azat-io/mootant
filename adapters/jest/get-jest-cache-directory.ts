import path from 'node:path'

/**
 * Gives mootant's own cache directory of Jest in a project, where Jest keeps
 * the transforms and haste maps of mootant's sessions, apart from the project's
 * own.
 *
 * @param root - Project root.
 * @returns Absolute path of the directory.
 */
export function getJestCacheDirectory(root: string): string {
  return path.join(root, 'node_modules', '.cache', 'mootant', 'jest')
}
