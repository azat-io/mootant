import { readFile } from 'node:fs/promises'

import type { PresetSettings } from '../../types/config/preset-settings'
import type { ActiveMutator } from '../../types/mutator/active-mutator'
import type { FileMutants } from '../../types/mutant/file-mutants'
import type { Diagnostic } from '../../types/mutant/diagnostic'

import { generateFileMutants } from '../generate/generate-file-mutants'
import { assertUniqueIds } from '../identity/assert-unique-ids'
import { expandPaths } from './expand-paths'

/**
 * Paths and mutators of a listing.
 */
interface ListFileMutantsOptions {
  /**
   * Settings merged through the presets and the configuration.
   */
  settings: Readonly<PresetSettings>

  /**
   * Ids of every registered mutator, for the ignore comments.
   */
  knownMutatorIds: Set<string>

  /**
   * Mutators turned on, in rank order.
   */
  mutators: ActiveMutator[]

  /**
   * Whether the candidates that were considered and not emitted are listed too.
   */
  skipped: boolean

  /**
   * Files and directories to list, as given on the command line.
   */
  paths: string[]

  /**
   * Directory that display paths are relative to.
   */
  root: string

  /**
   * Working directory the paths are relative to.
   */
  cwd: string
}

/**
 * Mutants of the listed files and the problems of their paths.
 */
interface ListedFileMutants {
  /**
   * Warnings about paths that were skipped.
   */
  diagnostics: Diagnostic[]

  /**
   * Results of every listed file, sorted by display path.
   */
  files: FileMutants[]
}

/**
 * Expands the paths of a run, reads every file and generates its mutants one
 * file at a time. A file that cannot be read is reported and the others are
 * still listed.
 *
 * @param options - Paths, working directory, root and mutators of the run.
 * @returns Mutants of every file and warnings about skipped paths.
 * @throws Error - When paths are missing or hold no source file, or when two
 *   mutants share an id.
 */
export async function listFileMutants(
  options: ListFileMutantsOptions,
): Promise<ListedFileMutants> {
  let { knownMutatorIds, mutators, settings, skipped } = options
  let { diagnostics, files } = await expandPaths(
    options.paths,
    options.cwd,
    options.root,
  )

  let sources = await Promise.allSettled(
    files.map(listed => readFile(listed.absolute, 'utf8')),
  )

  let results = files.map((listed, index): FileMutants => {
    let read = sources[index]!
    if (read.status === 'rejected') {
      let { code } = read.reason as NodeJS.ErrnoException
      return {
        diagnostics: [
          {
            message: `Cannot read the file (${code}).`,
            code: 'read-error',
            file: listed.file,
            severity: 'error',
            column: null,
            line: null,
          },
        ],
        absolute: listed.absolute,
        file: listed.file,
        parsed: false,
        source: null,
        skipped: [],
        mutants: [],
      }
    }
    return {
      ...generateFileMutants({
        source: read.value,
        file: listed.file,
        knownMutatorIds,
        settings,
        mutators,
        skipped,
      }),
      absolute: listed.absolute,
    }
  })

  assertUniqueIds(results)
  return { files: results, diagnostics }
}
