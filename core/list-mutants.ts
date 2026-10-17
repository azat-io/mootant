import type { ListResult } from '../types/report/list-result'

import { selectChangedMutants } from './files/select-changed-mutants'
import { readChangedLines } from './git/read-changed-lines'
import { listFileMutants } from './files/list-file-mutants'
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
   * Git revision given with `--since`: only mutants on lines changed since its
   * merge base with `HEAD` are listed.
   */
  since?: string

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
 * never change the mutants. With `--since`, only the mutants and skipped
 * candidates on lines changed since the merge base of the revision and `HEAD`
 * are listed, and only the changed files.
 *
 * @param options - Paths, configuration, preset and working directory of the
 *   run.
 * @returns Result of the run, before it is formatted.
 * @throws Error - When the configuration or a plugin cannot be loaded or is
 *   invalid, when a preset or mutator is unknown, when paths are missing or
 *   hold no source file, when two mutants share an id, or when the changed
 *   lines cannot be read from git.
 */
export async function listMutants(
  options: ListMutantsOptions,
): Promise<ListResult> {
  let { knownMutatorIds, mutators, settings, preset, root } =
    await prepareRun(options)
  let skipped = options.skipped ?? false
  let changes =
    options.since === undefined ?
      null
    : await readChangedLines(root, options.since)
  let { diagnostics, files } = await listFileMutants({
    paths: options.paths,
    cwd: options.cwd,
    knownMutatorIds,
    settings,
    mutators,
    skipped,
    root,
  })
  return {
    since:
      changes === null ? null : { ref: options.since!, base: changes.base },
    files:
      changes === null ? files : selectChangedMutants(files, changes.files),
    diagnostics,
    mutators,
    skipped,
    preset,
  }
}
