import path from 'node:path'

import type { FileMutants } from '../../types/mutant/file-mutants'
import type { Diagnostic } from '../../types/mutant/diagnostic'

import { getComponentFramework } from '../parser/get-component-framework'

/**
 * Files of a run and the warnings about files left out.
 */
interface RunFiles {
  /**
   * One warning per file left out.
   */
  diagnostics: Diagnostic[]

  /**
   * Files to mutate, in input order.
   */
  files: FileMutants[]
}

/**
 * Paths of mootant's worker runtime relative to its package directory, in the
 * sources and in the build: a switched `hit()` there would call itself.
 */
const SELF_RUNTIME_PATTERN =
  /^(?:dist\/)?(?:core\/runtime\/|adapters\/[^/]+\/(?:worker\/|runner\.))/u

/**
 * Names of component frameworks in messages.
 */
const FRAMEWORK_NAMES = { svelte: 'Svelte', astro: 'Astro', vue: 'Vue' }

/**
 * Leaves out the listed files a run must not mutate: test and setup files, Vue,
 * Svelte and Astro components, which runs do not support yet, and the files of
 * mootant's own worker runtime.
 *
 * @param listed - Listed files with their mutants.
 * @param testFiles - Absolute paths of the test and setup files.
 * @param packageDirectory - Directory of mootant's own package.
 * @returns Files to mutate and one warning per file left out.
 */
export function selectRunFiles(
  listed: readonly FileMutants[],
  testFiles: readonly string[],
  packageDirectory: string,
): RunFiles {
  let tests = new Set(testFiles.map(file => path.normalize(file)))
  let diagnostics: Diagnostic[] = []
  let files: FileMutants[] = []
  for (let entry of listed) {
    let { absolute, file } = entry
    let framework = getComponentFramework(file)
    let relative = path
      .relative(packageDirectory, absolute)
      .replaceAll(path.sep, '/')
    let problem: Pick<Diagnostic, 'message' | 'code'> | null = null
    if (tests.has(path.normalize(absolute))) {
      problem = {
        message: `${file} is a test or setup file; mootant run does not mutate it.`,
        code: 'test-file-excluded',
      }
    } else if (framework !== null) {
      problem = {
        message: `${file} is a ${FRAMEWORK_NAMES[framework]} component; mootant run does not run components yet.`,
        code: 'unsupported-file',
      }
    } else if (SELF_RUNTIME_PATTERN.test(relative)) {
      problem = {
        message: `${file} is part of mootant's worker runtime; a switched copy would call itself.`,
        code: 'self-runtime-file',
      }
    }
    if (problem === null) {
      files.push(entry)
    } else {
      diagnostics.push({
        ...problem,
        severity: 'warning',
        column: null,
        line: null,
        file,
      })
    }
  }
  return { diagnostics, files }
}
