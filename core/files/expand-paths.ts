import { realpath, readdir, stat } from 'node:fs/promises'
import path from 'node:path'

import type { Diagnostic } from '../../types/mutant/diagnostic'

import { isDeclarationFile } from '../parser/is-declaration-file'
import { compareCodeUnits } from '../compare-code-units'
import { isSourceFile } from './is-source-file'

/**
 * Outcome of resolving one input path.
 */
type InputResolution =
  | {
      /**
       * The input exists but cannot be resolved.
       */
      kind: 'failed'

      /**
       * Error code of the failure.
       */
      code: string
    }
  | {
      /**
       * The input exists.
       */
      kind: 'found'

      /**
       * Real absolute path of the input.
       */
      real: string
    }
  | {
      /**
       * The input does not exist.
       */
      kind: 'missing'
    }

/**
 * Source files found for the paths of a run.
 */
interface ExpandedPaths {
  /**
   * Warnings about paths that were skipped.
   */
  diagnostics: Diagnostic[]

  /**
   * Files without duplicates, sorted by display path.
   */
  files: ListedFile[]
}

/**
 * Files and warnings collected from one path.
 */
interface PathCollection {
  /**
   * Warnings about skipped paths.
   */
  diagnostics: Diagnostic[]

  /**
   * Source files found.
   */
  files: ListedFile[]
}

/**
 * Source file to list.
 */
interface ListedFile {
  /**
   * Real absolute path, used to read the file.
   */
  absolute: string

  /**
   * Path as reports print it.
   */
  file: string
}

/**
 * Characters of glob patterns, which the shell expands and mootant does not.
 */
const GLOB_PATTERN = /[*?[{]/u

/**
 * Turns the paths given on the command line into the source files to list.
 * Files are kept when they are JavaScript or TypeScript sources or Vue, Svelte
 * or Astro components; directories are walked recursively without
 * `node_modules`, entries starting with a dot and symbolic links. Paths are
 * resolved to real paths, so a file reached through a link or with other letter
 * case is listed once.
 *
 * @param paths - Paths as given on the command line.
 * @param cwd - Working directory the paths are relative to.
 * @param base - Directory display paths are relative to; the working directory
 *   when omitted.
 * @returns Files sorted by display path, the real path relative to the base
 *   directory with `/` separators, and warnings about skipped paths.
 * @throws Error - When a path is missing or cannot be accessed, or no source
 *   file is found.
 */
export async function expandPaths(
  paths: readonly string[],
  cwd: string,
  base: string = cwd,
): Promise<ExpandedPaths> {
  let root = await realpath(base)
  let resolutions = await Promise.all(
    paths.map(input => resolveInput(cwd, input)),
  )

  let missing: string[] = []
  let reals: string[] = []
  for (let [index, resolution] of resolutions.entries()) {
    let input = paths[index]!
    switch (resolution.kind) {
      case 'missing':
        missing.push(input)
        break
      case 'failed':
        throw new Error(`Cannot access ${input} (${resolution.code}).`)
      case 'found':
        reals.push(resolution.real)
        break
    }
  }
  if (missing.length > 0) {
    throw new Error(createMissingMessage(missing))
  }

  let collections = await Promise.all(
    reals.map(real => collectPath(real, root)),
  )
  let diagnostics: Diagnostic[] = []
  let seen = new Set<string>()
  let files: ListedFile[] = []
  for (let collection of collections) {
    diagnostics.push(...collection.diagnostics)
    for (let file of collection.files) {
      if (!seen.has(file.absolute)) {
        seen.add(file.absolute)
        files.push(file)
      }
    }
  }
  if (files.length === 0) {
    throw new Error(
      `No JavaScript or TypeScript files found in ${paths.join(', ')}.`,
    )
  }

  files.sort((left, right) => compareCodeUnits(left.file, right.file))
  return { diagnostics, files }
}

/**
 * Collects the source files of a directory tree. Entries named `node_modules`,
 * entries starting with a dot and symbolic links are skipped, which also keeps
 * the walk out of link cycles; files that are not JavaScript or TypeScript
 * sources or components are skipped silently.
 *
 * @param directory - Real absolute path of the directory.
 * @param root - Real path of the working directory.
 * @returns Source files of the tree and warnings about unreadable directories.
 */
async function walkDirectory(
  directory: string,
  root: string,
): Promise<PathCollection> {
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch (error) {
    let { code } = error as NodeJS.ErrnoException
    return {
      diagnostics: [
        createSkippedWarning(
          `Skipped ${getDisplayPath(directory, root)}: cannot read the directory (${code}).`,
        ),
      ],
      files: [],
    }
  }

  let subdirectories: string[] = []
  let files: ListedFile[] = []
  for (let entry of entries) {
    if (
      entry.name === 'node_modules' ||
      entry.name.startsWith('.') ||
      entry.isSymbolicLink()
    ) {
      continue
    }
    let absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      subdirectories.push(absolute)
    } else if (entry.isFile() && isSourceFile(entry.name)) {
      files.push({ file: getDisplayPath(absolute, root), absolute })
    }
  }

  let nested = await Promise.all(
    subdirectories.map(subdirectory => walkDirectory(subdirectory, root)),
  )
  let diagnostics: Diagnostic[] = []
  for (let collection of nested) {
    diagnostics.push(...collection.diagnostics)
    files.push(...collection.files)
  }
  return { diagnostics, files }
}

/**
 * Collects the source files of one existing path: the file itself, or the files
 * of a directory tree.
 *
 * @param real - Real absolute path given on the command line.
 * @param root - Real path of the working directory.
 * @returns Source files and warnings about the path.
 */
async function collectPath(
  real: string,
  root: string,
): Promise<PathCollection> {
  let stats = await stat(real)
  if (stats.isDirectory()) {
    return walkDirectory(real, root)
  }
  if (stats.isFile() && isSourceFile(real)) {
    return {
      files: [{ file: getDisplayPath(real, root), absolute: real }],
      diagnostics: [],
    }
  }
  let reason =
    stats.isFile() && isDeclarationFile(real) ?
      'declaration files have nothing to mutate'
    : 'not a JavaScript or TypeScript source file'
  return {
    diagnostics: [
      createSkippedWarning(`Skipped ${getDisplayPath(real, root)}: ${reason}.`),
    ],
    files: [],
  }
}

/**
 * Resolves an input path to its real path.
 *
 * @param cwd - Working directory the input is relative to.
 * @param input - Path as given on the command line.
 * @returns The real path, the error code of a path that cannot be accessed, or
 *   that the path is missing.
 */
async function resolveInput(
  cwd: string,
  input: string,
): Promise<InputResolution> {
  try {
    return { real: await realpath(path.resolve(cwd, input)), kind: 'found' }
  } catch (error) {
    let { code } = error as NodeJS.ErrnoException
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      return { kind: 'missing' }
    }
    return { code: String(code), kind: 'failed' }
  }
}

/**
 * Builds the error message for inputs that do not exist.
 *
 * @param missing - Missing inputs in command line order.
 * @returns Message naming the inputs, with a hint when one looks like a glob
 *   pattern.
 */
function createMissingMessage(missing: string[]): string {
  let message =
    missing.length === 1 ?
      `Path not found: ${missing[0]}.`
    : `Paths not found: ${missing.join(', ')}.`
  if (missing.some(input => GLOB_PATTERN.test(input))) {
    message +=
      ' Mootant does not expand glob patterns; let the shell expand them or pass a directory.'
  }
  return message
}

/**
 * Builds the path reports print for a real path: relative to the working
 * directory, with `/` separators, in Unicode normalization form C. The working
 * directory itself is `.`.
 *
 * @param real - Real absolute path.
 * @param root - Real path of the working directory.
 * @returns Path relative to the working directory, such as `src/cart.ts`.
 */
function getDisplayPath(real: string, root: string): string {
  let relative = path.relative(root, real)
  if (relative === '') {
    return '.'
  }
  return relative.replaceAll(path.sep, '/').normalize('NFC')
}

/**
 * Builds a warning about a skipped path, which belongs to the run rather than
 * to a file.
 *
 * @param message - Sentence naming the path and why it was skipped.
 * @returns Warning without a file or position.
 */
function createSkippedWarning(message: string): Diagnostic {
  return {
    code: 'skipped-path',
    severity: 'warning',
    column: null,
    file: null,
    line: null,
    message,
  }
}
