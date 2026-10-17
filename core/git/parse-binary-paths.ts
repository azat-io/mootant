/**
 * Reads the files git counts as binary from `git diff --numstat -z`: entries
 * whose added and removed counts are `-`. An entry is the counts and a path,
 * or, for a renamed or copied file, the counts, an empty path, the old path and
 * the new path, each ended by NUL.
 *
 * @param numstat - Output of `git diff --numstat -z`.
 * @returns New paths of the binary files, relative to the top of the
 *   repository.
 */
export function parseBinaryPaths(numstat: string): string[] {
  let fields = numstat.split('\0')
  let paths: string[] = []
  let index = 0
  while (index < fields.length - 1) {
    let field = fields[index]!
    let [added, removed] = field.split('\t', 2) as [string, string]
    let name = field.slice(added.length + removed.length + 2)
    let file = name
    if (name === '') {
      index += 2
      file = fields[index]!
    }
    if (added === '-' && removed === '-') {
      paths.push(file)
    }
    index += 1
  }
  return paths
}
