import type { TemplateCompilers } from '../../types/source/template-compilers'
import type { SwitchedFile } from '../../types/adapter/switched-file'
import type { Diagnostic } from '../../types/mutant/diagnostic'
import type { Mutant } from '../../types/mutant/mutant'

import { getComponentFramework } from '../parser/get-component-framework'
import { checkSvelteCompile } from './check-svelte-compile'
import { checkVueCompile } from './check-vue-compile'
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
 * reported, so its mutants end as `Error`; so is a Svelte or Vue component
 * whose switched text the compiler of its framework rejects, with the message
 * of the compiler.
 *
 * @param files - Listed files to run, with their text and mutants.
 * @param compilers - Compilers of the project; a compiler that is null, or
 *   every compiler when omitted, does not check its components.
 * @returns Switched files and an `instrument-error` per file left out.
 */
export function createSwitchedFiles(
  files: readonly SwitchingFile[],
  compilers: TemplateCompilers = { svelte: null, vue: null },
): SwitchedFiles {
  let diagnostics: Diagnostic[] = []
  let switched: SwitchedFile[] = []
  for (let { absolute, mutants, source, file } of files) {
    let pending = mutants.filter(mutant => mutant.status === 'Pending')
    if (source === null || pending.length === 0) {
      continue
    }
    try {
      let text = instrumentFile({ mutants: pending, compilers, source, file })
      let component = { original: source, switched: text, file }
      let framework = getComponentFramework(file)
      if (framework === 'svelte' && compilers.svelte) {
        let problem = checkSvelteCompile(compilers.svelte, component)
        if (problem !== null) {
          throw new Error(
            `Svelte does not compile the switched file: ${problem}`,
          )
        }
      }
      if (framework === 'vue' && compilers.vue) {
        let problem = checkVueCompile(compilers.vue, component)
        if (problem !== null) {
          throw new Error(
            `Vue does not compile the switched template: ${problem}`,
          )
        }
      }
      switched.push({ original: source, file: absolute, switched: text })
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
