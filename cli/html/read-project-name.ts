import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Reads the name of the project for the HTML report: the `name` of the
 * `package.json` in the project root, else the name of the root directory.
 *
 * @param root - Directory of the configuration, where `package.json` is read.
 * @returns Package name, or the directory name without one.
 */
export function readProjectName(root: string): string {
  let name: unknown
  try {
    ;({ name } = JSON.parse(
      readFileSync(path.join(root, 'package.json'), 'utf8'),
    ) as { name?: unknown })
  } catch {
    name = null
  }
  return typeof name === 'string' && name !== '' ? name : path.basename(root)
}
