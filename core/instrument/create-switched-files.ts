import type { SwitchedFile } from '../../types/adapter/switched-file'
import type { Diagnostic } from '../../types/mutant/diagnostic'
import type { Mutant } from '../../types/mutant/mutant'

import { instrumentFile } from './instrument-file'

/**
 * Listed file to switch.
 */
interface SwitchingFile {
  /**
   * Text of the file as read, or null when it could not be read.
   */
  source: string | null

  /**
   * Mutants of the file, pending and ignored.
   */
  mutants: Mutant[]

  /**
   * Real absolute path of the file.
   */
  absolute: string

  /**
   * Path as reports print it.
   */
  file: string
}

/**
 * Switched files of a run and the problems of hosting.
 */
interface SwitchedFiles {
  /**
   * One `instrument-error` per file whose mutants could not be hosted.
   */
  diagnostics: Diagnostic[]

  /**
   * Files with every pending mutant hosted, in input order.
   */
  switched: SwitchedFile[]
}

/**
 * Builds the switched text of every file that has pending mutants. Ignored
 * mutants get no site. A file whose mutants cannot be hosted is left out and
 * reported, so its mutants end as `Error`.
 *
 * @param files - Listed files to run, with their text and mutants.
 * @returns Switched files and an `instrument-error` per file left out.
 */
export function createSwitchedFiles(
  files: readonly SwitchingFile[],
): SwitchedFiles {
  let diagnostics: Diagnostic[] = []
  let switched: SwitchedFile[] = []
  for (let { absolute, mutants, source, file } of files) {
    let pending = mutants.filter(mutant => mutant.status === 'Pending')
    if (source === null || pending.length === 0) {
      continue
    }
    try {
      switched.push({
        switched: instrumentFile({ mutants: pending, source, file }),
        original: source,
        file: absolute,
      })
    } catch (error) {
      diagnostics.push({
        message: `Cannot host the mutants of ${file}. ${(error as Error).message}`,
        code: 'instrument-error',
        severity: 'error',
        column: null,
        line: null,
        file,
      })
    }
  }
  return { diagnostics, switched }
}
