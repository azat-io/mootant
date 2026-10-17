import { realpath } from 'node:fs/promises'

import { runGit } from './run-git'

/**
 * Finds the top directory of the git working tree a directory is in.
 *
 * @param directory - Directory inside the working tree.
 * @returns Real absolute path of the top directory.
 * @throws Error - When the directory is not inside a git working tree, when git
 *   refuses the repository, such as one owned by another user, with what git
 *   printed, or when git cannot run.
 */
export async function findGitRoot(directory: string): Promise<string> {
  let result = await runGit(['rev-parse', '--show-toplevel'], directory)
  if (result.code !== 0) {
    if (result.stderr.includes('not a git repository')) {
      throw new Error(
        `--since needs a git repository, and ${directory} is not inside one.`,
      )
    }
    throw new Error(`--since: git rev-parse failed: ${result.stderr.trim()}`)
  }
  return realpath(result.stdout.replace(/\r?\n$/u, ''))
}
