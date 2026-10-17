import { unquoteGitPath } from './unquote-git-path'

/**
 * Hunk header of a unified diff: start and count of the old lines, then of the
 * new lines; a count left out is 1.
 */
const HUNK_PATTERN =
  /^@@ -\d+(?:,(?<removed>\d+))? \+(?<start>\d+)(?:,(?<added>\d+))? @@/u

/**
 * Reads the changed lines of every file from a unified diff without context
 * lines (`--unified=0`) whose new paths start with `b/`. A hunk that adds or
 * changes lines marks them; a hunk that only removes lines marks the line
 * before the gap and the line after it, the closest code whose meaning the
 * removal changed (and every mutant spanning the gap touches one of them). A
 * renamed file without changes, a deleted file and a binary file have no lines
 * here. Hunk lines are skipped by count, so a changed line that looks like a
 * header is never read as one.
 *
 * @param diff - Output of `git diff`.
 * @returns Changed line numbers of the new files, from 1, by path relative to
 *   the top of the repository.
 */
export function parseUnifiedDiff(diff: string): Map<string, Set<number>> {
  let files = new Map<string, Set<number>>()
  let lines = new Set<number>()
  let remaining = 0
  for (let line of diff.split('\n')) {
    if (remaining > 0) {
      if (!line.startsWith('\\')) {
        remaining -= 1
      }
      continue
    }
    if (line.startsWith('+++ ')) {
      lines = new Set()
      files.set(readNewPath(line.slice(4)), lines)
      continue
    }
    let hunk = HUNK_PATTERN.exec(line)
    if (hunk === null) {
      continue
    }
    let { removed = '1', added = '1', start } = hunk.groups!
    let first = Number(start)
    let count = Number(added)
    remaining = Number(removed) + count
    if (count === 0) {
      lines.add(Math.max(first, 1))
      lines.add(first + 1)
    }
    for (let offset = 0; offset < count; offset++) {
      lines.add(first + offset)
    }
  }
  return files
}

/**
 * Reads the new path of a `+++` line: unquoted, without the tab git adds after
 * a path with spaces, and without the `b/` prefix.
 *
 * @param text - Text after `+++ `.
 * @returns Path relative to the top of the repository.
 */
function readNewPath(text: string): string {
  let name = text.endsWith('\t') ? text.slice(0, -1) : text
  return (name.startsWith('"') ? unquoteGitPath(name) : name).slice(2)
}
