import { realpath, readdir, stat } from 'node:fs/promises'
import path from 'node:path'

import { compareCodeUnits } from '../../core/compare-code-units'
import { createGlobPattern } from './create-glob-pattern'

/**
 * Lists the test files of a command, as Node finds them with `--test`: a file
 * as it is, wherever it is; a directory with the default globs inside it; a
 * glob against every file of the project outside `node_modules` and outside
 * directories and files whose names start with a dot. Without files or globs
 * the default globs apply. Missing paths match nothing.
 *
 * @param root - Project root, which relative paths start from.
 * @param patterns - Files, directories and globs of the command.
 * @param defaults - Globs of the tool's default test files.
 * @returns Real absolute paths, sorted, each once.
 */
export async function listNodeTestFiles(
  root: string,
  patterns: readonly string[],
  defaults: readonly string[],
): Promise<string[]> {
  let given = patterns.length > 0 ? patterns : defaults
  let entries = await Promise.all(
    given.map(async pattern => {
      let relative = toPosix(
        path.isAbsolute(pattern) ? path.relative(root, pattern) : pattern,
      ).replace(/^(?:\.\/)+/u, '')
      if (/[*?[{]/u.test(relative)) {
        return { globs: [createGlobPattern(relative)], file: null }
      }
      let absolute = path.resolve(root, relative)
      let info: Awaited<ReturnType<typeof stat>> | null = null
      try {
        info = await stat(absolute)
      } catch {}
      if (info?.isDirectory()) {
        let prefix = toPosix(path.relative(root, absolute))
        return {
          globs: defaults.map(glob =>
            createGlobPattern(prefix === '' ? glob : `${prefix}/${glob}`),
          ),
          file: null,
        }
      }
      return { file: info?.isFile() ? absolute : null, globs: [] }
    }),
  )
  let globs = entries.flatMap(entry => entry.globs)
  let found = new Set(entries.flatMap(entry => entry.file ?? []))
  let files = globs.length > 0 ? await listFiles(root, '') : []
  for (let file of files) {
    if (globs.some(glob => glob.test(file))) {
      found.add(path.join(root, file))
    }
  }
  let real = await Promise.all([...found].map(file => realpath(file)))
  return [...new Set(real)].toSorted(compareCodeUnits)
}

/**
 * Lists the files of a directory and its subdirectories, but `node_modules` and
 * names that start with a dot.
 *
 * @param root - Project root.
 * @param directory - Directory relative to the root, with `/` separators, or an
 *   empty string for the root.
 * @returns Paths relative to the root, with `/` separators.
 */
async function listFiles(root: string, directory: string): Promise<string[]> {
  let entries = await readdir(path.join(root, directory), {
    withFileTypes: true,
  })
  let lists = await Promise.all(
    entries.map(async entry => {
      let relative =
        directory === '' ? entry.name : `${directory}/${entry.name}`
      if (entry.name.startsWith('.') || entry.name === 'node_modules') {
        return []
      }
      if (entry.isDirectory()) {
        return listFiles(root, relative)
      }
      return entry.isFile() ? [relative] : []
    }),
  )
  return lists.flat()
}

/**
 * Turns the separators of a path into `/`.
 *
 * @param file - Path with the separators of the platform.
 * @returns Path with `/`.
 */
function toPosix(file: string): string {
  return file.split(path.sep).join('/')
}
