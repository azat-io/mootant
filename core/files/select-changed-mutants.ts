import type { FileMutants } from '../../types/mutant/file-mutants'
import type { ChangedLines } from '../../types/git/changed-lines'

import { getSourcePosition } from '../text/get-source-position'

/**
 * Keeps the mutants on changed lines, for `--since`: only the files that
 * changed, with their diagnostics, and in them the mutants and skipped
 * candidates whose lines, from the first to the last, include a changed one.
 * Every mutant of a file git does not track is kept. Lines are counted as git
 * counts them, by line feeds only, so a lone carriage return or a line
 * separator in a string does not shift them.
 *
 * @param files - Listed files.
 * @param changed - Changed lines by real absolute path.
 * @returns The changed files with their mutants on changed lines.
 */
export function selectChangedMutants(
  files: FileMutants[],
  changed: ChangedLines['files'],
): FileMutants[] {
  return files.flatMap(file => {
    let lines = changed.get(file.absolute)
    if (lines === undefined) {
      return []
    }
    let { source } = file
    if (lines === 'all' || source === null) {
      return [file]
    }
    let changedLines = lines
    let lineStarts = [0]
    for (
      let index = source.indexOf('\n');
      index !== -1;
      index = source.indexOf('\n', index + 1)
    ) {
      lineStarts.push(index + 1)
    }
    /**
     * Tells whether a range spans a changed line.
     *
     * @param range - Offsets of the range.
     * @param range.start - Offset of its first character.
     * @param range.end - Offset after its last character.
     * @returns Whether a line of the range changed.
     */
    function isChanged(range: { start: number; end: number }): boolean {
      let first = getSourcePosition(lineStarts, range.start).line
      let last = getSourcePosition(lineStarts, range.end).line
      for (let line = first; line <= last; line++) {
        if (changedLines.has(line)) {
          return true
        }
      }
      return false
    }
    return [
      {
        ...file,
        mutants: file.mutants.filter(isChanged),
        skipped: file.skipped.filter(isChanged),
      },
    ]
  })
}
