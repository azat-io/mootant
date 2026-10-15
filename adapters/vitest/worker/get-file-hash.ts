import { createHash } from 'node:crypto'

/**
 * Names a test file of a project in the work directory: the plan of a test file
 * is `plan/<hash>.json`, and its units are `<hash>-<n>`. A test file that
 * several projects include gets a name per project.
 *
 * @param file - Absolute path of the test file.
 * @param project - Name of the Vitest project, or an empty string.
 * @returns First 16 hexadecimal digits of the SHA-256 hash of the project name
 *   and the path.
 */
export function getFileHash(file: string, project: string): string {
  return createHash('sha256')
    .update(`${project}\0${file}`)
    .digest('hex')
    .slice(0, 16)
}
