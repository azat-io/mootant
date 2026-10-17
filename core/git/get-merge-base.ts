import { runGit } from './run-git'

/**
 * Finds the commit `--since` compares the working tree with: the merge base of
 * a revision and `HEAD`, so changes made on the revision's side after the
 * branch point are not counted.
 *
 * @param revision - Revision as given, such as `main`.
 * @param gitRoot - Top directory of the working tree.
 * @returns Full hash of the merge-base commit.
 * @throws Error - When `HEAD` has no commit, the revision is unknown or names
 *   no commit, the two have no common commit, or git fails otherwise.
 */
export async function getMergeBase(
  revision: string,
  gitRoot: string,
): Promise<string> {
  let head = await runGit(['rev-parse', '--verify', 'HEAD^{commit}'], gitRoot)
  if (head.code !== 0) {
    if (head.stderr.includes('Needed a single revision')) {
      throw new Error('--since needs a commit on HEAD.')
    }
    throw new Error(`--since: git rev-parse failed: ${head.stderr.trim()}`)
  }
  /*
   * The revision is resolved before it is peeled to a commit: a suffix such as
   * `^{commit}` would become part of the message of `:/<message>`.
   */
  let named = await runGit(
    ['rev-parse', '--verify', '--quiet', '--end-of-options', revision],
    gitRoot,
  )
  if (named.code !== 0) {
    throw new Error(`--since: unknown git revision "${revision}".`)
  }
  let resolved = await runGit(
    ['rev-parse', '--verify', '--quiet', `${named.stdout.trim()}^{commit}`],
    gitRoot,
  )
  if (resolved.code !== 0) {
    throw new Error(`--since: git revision "${revision}" is not a commit.`)
  }
  let base = await runGit(
    ['merge-base', resolved.stdout.trim(), 'HEAD'],
    gitRoot,
  )
  if (base.code !== 0) {
    throw new Error(
      `--since: ${revision} and HEAD have no common commit; a shallow clone may need "git fetch --deepen".`,
    )
  }
  return base.stdout.trim()
}
