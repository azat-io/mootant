import path from 'node:path'

import { createDigest } from '../../core/cache/create-digest'

/**
 * Gives the id of a test of node:test: a hash of the test file's path relative
 * to the project root, the full name of the test and how many tests of the file
 * had that name before it, so tests with the same name differ and ids do not
 * depend on where the project is.
 *
 * @param root - Project root.
 * @param file - Absolute path of the test file.
 * @param test - Full name of the test and its occurrence.
 * @param test.name - Full name with suites, joined by `>`.
 * @param test.occurrence - Earlier tests of the file with the same name.
 * @returns 16 hexadecimal digits.
 */
export function getTestId(
  root: string,
  file: string,
  test: { occurrence: number; name: string },
): string {
  let relative = path.relative(root, file).split(path.sep).join('/')
  return createDigest([relative, test.name, test.occurrence]).slice(0, 16)
}
