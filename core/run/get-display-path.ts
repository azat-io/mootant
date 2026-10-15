import path from 'node:path'

/**
 * Builds the path reports print for an absolute path: relative to the root,
 * with `/` separators.
 *
 * @param file - Absolute path.
 * @param root - Directory display paths are relative to.
 * @returns Path such as `test/cart.test.ts`.
 */
export function getDisplayPath(file: string, root: string): string {
  return path.relative(root, file).replaceAll(path.sep, '/')
}
