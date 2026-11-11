import path from 'node:path'

import { createDigest } from '../../core/cache/create-digest'

/**
 * Gives the id of a test: a hash of the test file's path relative to the
 * project root, the full name of the test, how many tests of the file had that
 * name before it and the project, if any, so tests with the same name differ
 * and ids do not depend on where the project is.
 *
 * @param root - Project root.
 * @param file - Absolute path of the test file.
 * @param test - Full name of the test, its occurrence and its project.
 * @param test.name - Full name with suites, joined by `>`.
 * @param test.occurrence - Earlier tests of the file with the same name.
 * @param test.project - Project of the test; an empty one counts as none.
 * @returns 16 hexadecimal digits.
 */
export function getTestId(
  root: string,
  file: string,
  test: { occurrence: number; project?: string; name: string },
): string {
  let relative = path.relative(root, file).split(path.sep).join('/')
  let input = [relative, test.name, test.occurrence]
  if (test.project !== undefined && test.project !== '') {
    input.push(test.project)
  }
  return createDigest(input).slice(0, 16)
}
