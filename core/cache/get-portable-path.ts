import path from 'node:path'

/**
 * Builds the path the cache keeps for an absolute path: relative to the project
 * root, with every backslash turned into `/`, so the cache file and its keys do
 * not depend on where the project lives or on the platform. Stored paths are
 * read back with `path.resolve`.
 *
 * @param file - Absolute path.
 * @param root - Project root.
 * @returns Path such as `src/cart.ts`.
 */
export function getPortablePath(file: string, root: string): string {
  return path.relative(root, file).replaceAll('\\', '/')
}
