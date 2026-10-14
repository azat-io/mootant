import { readFile } from 'node:fs/promises'

import type { FileMutants } from '../types/file-mutants'
import type { ListResult } from '../types/list-result'

import { createMutatorRegistry } from './plugins/create-mutator-registry'
import { generateFileMutants } from './generate/generate-file-mutants'
import { assertUniqueIds } from './identity/assert-unique-ids'
import { resolvePreset } from './plugins/resolve-preset'
import { expandPaths } from './files/expand-paths'
import { corePlugin } from './plugins/core-plugin'

/**
 * Options of a list run.
 */
interface ListMutantsOptions {
  /**
   * Files and directories to list, as given on the command line.
   */
  paths: string[]

  /**
   * Id of the preset that turns mutators on.
   */
  preset: string

  /**
   * Working directory that display paths are relative to.
   */
  cwd: string
}

/**
 * Lists the mutants of the given files and directories: resolves the preset,
 * expands the paths, reads every file and generates its mutants one file at a
 * time. A file that cannot be read or parsed is reported and the others are
 * still listed.
 *
 * @param options - Paths, preset and working directory of the run.
 * @returns Result of the run, before it is formatted.
 * @throws Error - When the preset is unknown or broken, when paths are missing
 *   or hold no source file, or when two mutants share an id.
 */
export async function listMutants(
  options: ListMutantsOptions,
): Promise<ListResult> {
  let registry = createMutatorRegistry(corePlugin, {})
  let { mutators, settings } = resolvePreset(registry, options.preset)
  let { diagnostics, files } = await expandPaths(options.paths, options.cwd)
  let knownMutatorIds = new Set(registry.mutators.keys())

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
        file: listed.file,
        parsed: false,
        source: null,
        mutants: [],
      }
    }
    return generateFileMutants({
      source: read.value,
      file: listed.file,
      knownMutatorIds,
      settings,
      mutators,
    })
  })

  assertUniqueIds(results)
  return { preset: options.preset, files: results, diagnostics, mutators }
}
