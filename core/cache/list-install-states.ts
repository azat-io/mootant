import path from 'node:path'

/**
 * Files package managers write about what they installed: npm's hidden
 * lockfile, written without a lockfile too, the copy of the lockfile pnpm
 * installed from, the install state of Yarn's `node_modules` linker and of Yarn
 * 1, and the map of Yarn's Plug'n'Play with its data when that is apart.
 */
const STATE_FILES = [
  'node_modules/.package-lock.json',
  'node_modules/.pnpm/lock.yaml',
  'node_modules/.yarn-state.yml',
  'node_modules/.yarn-integrity',
  '.pnp.data.json',
  '.pnp.cjs',
]

/**
 * Lists the files that tell what a package manager installed, in the root and
 * in every directory above it, where Node looks for packages, as in a workspace
 * that installs above the root with or without a lockfile. They follow what is
 * installed when the lockfile does not, as after a switch of branches without
 * an install. Every name is listed, missing files included, so one that appears
 * changes the hashes as a changed one does.
 *
 * @param root - Project root.
 * @returns Absolute paths, missing files included, from the root up.
 */
export function listInstallStates(root: string): string[] {
  let files: string[] = []
  let directory = root
  for (;;) {
    for (let name of STATE_FILES) {
      files.push(path.join(directory, name))
    }
    let parent = path.dirname(directory)
    if (parent === directory) {
      return files
    }
    directory = parent
  }
}
