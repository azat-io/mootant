import { realpathSync } from 'node:fs'
import path from 'node:path'

import type { ChangedLines } from '../../types/git/changed-lines'

import { parseUnifiedDiff } from './parse-unified-diff'
import { parseBinaryPaths } from './parse-binary-paths'
import { getMergeBase } from './get-merge-base'
import { findGitRoot } from './find-git-root'
import { runGit } from './run-git'

/**
 * Options of `git diff` that make its output the same whatever the user's git
 * configuration: no colors, external or text-converting diff tools, context
 * lines or merged hunks, paths from the top with `a/` and `b/`, renames found
 * and deleted files left out.
 */
const DIFF_OPTIONS = [
  'diff',
  '--no-color',
  '--no-ext-diff',
  /* Cspell:disable-next-line */
  '--no-textconv',
  '--no-relative',
  '--ignore-submodules',
  '--unified=0',
  '--inter-hunk-context=0',
  '--find-renames',
  /* Cspell:disable-next-line */
  '--diff-filter=ACMR',
  '--src-prefix=a/',
  '--dst-prefix=b/',
]

/**
 * Options of `git diff` that count the added and removed lines of every file
 * with NUL-ended paths, `-` for a binary file. Options that imply a patch, such
 * as `--unified`, are left out so only the counts are printed.
 */
const NUMSTAT_OPTIONS = [
  'diff',
  '--numstat',
  '-z',
  '--no-ext-diff',
  /* Cspell:disable-next-line */
  '--no-textconv',
  '--no-relative',
  '--ignore-submodules',
  '--find-renames',
  /* Cspell:disable-next-line */
  '--diff-filter=ACMR',
]

/**
 * Finds the lines changed since a git revision, for `--since`: the working
 * tree, committed, staged and unstaged changes alike, against the merge base of
 * the revision and `HEAD`, plus every untracked file that `.gitignore` does not
 * exclude, whole. A file git counts as binary has no line hunks, so it counts
 * whole too: a source file can be binary to git, such as one with a NUL byte or
 * marked `-diff` in `.gitattributes`. Submodules are left out. Paths are real,
 * so they match the paths of listed files.
 *
 * @param directory - Directory inside the working tree, such as the project
 *   root.
 * @param revision - Revision as given, such as `main`.
 * @returns Changed lines by file and the merge-base commit.
 * @throws Error - When git is missing, the directory is not in a repository,
 *   the revision is unknown or has no common commit with `HEAD`, or git fails.
 */
export async function readChangedLines(
  directory: string,
  revision: string,
): Promise<ChangedLines> {
  let gitRoot = await findGitRoot(directory)
  let base = await getMergeBase(revision, gitRoot)
  let diff = await readGit([...DIFF_OPTIONS, base], gitRoot)
  let numstat = await readGit([...NUMSTAT_OPTIONS, base], gitRoot)
  let untracked = await readGit(
    ['ls-files', '--others', '--exclude-standard', '-z'],
    gitRoot,
  )
  let files: ChangedLines['files'] = new Map()
  for (let [file, lines] of parseUnifiedDiff(diff)) {
    files.set(resolveRealPath(gitRoot, file), lines)
  }
  for (let file of parseBinaryPaths(numstat)) {
    files.set(resolveRealPath(gitRoot, file), 'all')
  }
  for (let file of untracked.split('\0')) {
    if (file !== '') {
      files.set(resolveRealPath(gitRoot, file), 'all')
    }
  }
  return { files, base }
}

/**
 * Runs a git command that must succeed.
 *
 * @param gitArguments - Arguments after `git`.
 * @param gitRoot - Top directory of the working tree.
 * @returns Standard output.
 * @throws Error - When the command fails, with what git printed.
 */
async function readGit(
  gitArguments: string[],
  gitRoot: string,
): Promise<string> {
  let result = await runGit(gitArguments, gitRoot)
  if (result.code !== 0) {
    throw new Error(
      `--since: git ${gitArguments[0]} failed: ${result.stderr.trim()}`,
    )
  }
  return result.stdout
}

/**
 * Resolves a path relative to the top of the repository to a real path, such as
 * a path through a symbolic link to a directory; a path that cannot be
 * resolved, such as a broken link, stays as it is.
 *
 * @param gitRoot - Real top directory of the working tree.
 * @param file - Path relative to it, with forward slashes.
 * @returns Absolute path.
 */
function resolveRealPath(gitRoot: string, file: string): string {
  let absolute = path.join(gitRoot, file)
  try {
    return realpathSync.native(absolute)
  } catch {
    return absolute
  }
}
