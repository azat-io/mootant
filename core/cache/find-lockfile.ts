import { existsSync } from 'node:fs'
import path from 'node:path'

/**
 * Lock files of package managers, in the order they are looked for.
 */
const LOCK_FILES = [
  'pnpm-lock.yaml',
  'package-lock.json',
  'npm-shrinkwrap.json',
  'yarn.lock',
  'bun.lock',
  'bun.lockb',
]

/**
 * Finds the lockfile that pins the dependencies of a project: the first one in
 * the root or the closest directory above it, as in a workspace.
 *
 * @param root - Project root.
 * @returns Absolute path of the lockfile, or null when there is none.
 */
export function findLockfile(root: string): string | null {
  let directory = root
  for (;;) {
    for (let name of LOCK_FILES) {
      let file = path.join(directory, name)
      if (existsSync(file)) {
        return file
      }
    }
    let parent = path.dirname(directory)
    if (parent === directory) {
      return null
    }
    directory = parent
  }
}
