import { readFile } from 'node:fs/promises'

import type { FileMutants } from '../types/file-mutants'
import type { ListResult } from '../types/list-result'

import { generateFileMutants } from './generate/generate-file-mutants'
import { assertUniqueIds } from './identity/assert-unique-ids'
import { expandPaths } from './files/expand-paths'
import { prepareRun } from './config/prepare-run'

/**
 * Options of a list run.
 */
interface ListMutantsOptions {
  /**
   * Whether the candidates that were considered and not emitted are listed too;
   * false when omitted.
   */
  skipped?: boolean

  /**
   * Files and directories to list, as given on the command line.
   */
  paths: string[]

  /**
   * Path of the configuration file given with `--config`; the configuration is
   * searched for when omitted.
   */
  config?: string

  /**
   * Id of the preset that replaces the presets of the configuration; the
   * configuration's `extends`, or `recommended`, when omitted.
   */
  preset?: string

  /**
   * Working directory that display paths are relative to.
   */
  cwd: string
}

/**
 * Lists the mutants of the given files and directories: loads the configuration
 * and its plugins, resolves the presets, expands the paths with display paths
 * relative to the project root, reads every file and generates its mutants one
 * file at a time. A file that cannot be read or parsed is reported and the
 * others are still listed. Skipped candidates are collected only on request and
 * never change the mutants.
 *
 * @param options - Paths, configuration, preset and working directory of the
 *   run.
 * @returns Result of the run, before it is formatted.
 * @throws Error - When the configuration or a plugin cannot be loaded or is
 *   invalid, when a preset or mutator is unknown, when paths are missing or
 *   hold no source file, or when two mutants share an id.
 */
export async function listMutants(
  options: ListMutantsOptions,
): Promise<ListResult> {
  let { knownMutatorIds, mutators, settings, preset, root } =
    await prepareRun(options)
  let { diagnostics, files } = await expandPaths(
    options.paths,
    options.cwd,
    root,
  )
  let skipped = options.skipped ?? false

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
        skipped: [],
        mutants: [],
      }
    }
    return generateFileMutants({
      source: read.value,
      file: listed.file,
      knownMutatorIds,
      settings,
      mutators,
      skipped,
    })
  })

  assertUniqueIds(results)
  return {
    files: results,
    diagnostics,
    mutators,
    skipped,
    preset,
  }
}
