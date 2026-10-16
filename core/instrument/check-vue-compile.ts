import type { CompilerError } from '@vue/compiler-dom'

import type { SwitchedFile } from '../../types/adapter/switched-file'
import type { VueCompiler } from '../../types/source/vue-compiler'

import { findVueTemplate } from '../parser/find-vue-template'

/**
 * Checks that the template of a switched Vue component still compiles, so a
 * mutant that the compiler rejects does not fail the tests of every other
 * mutant of the file. The template is compiled as the Vue plugin of Vite
 * compiles it, with names read as properties of the component, which makes the
 * compiler parse every expression. The original text is compiled first: a
 * template that the compiler rejects as written, or a file without a template
 * of markup, is let through.
 *
 * @param compiler - Vue template compiler of the project.
 * @param component - Path of the component, its text as read and its switched
 *   text.
 * @returns Message of the compiler for the switched template, or null when it
 *   compiles or the original does not.
 */
export function checkVueCompile(
  compiler: VueCompiler,
  component: SwitchedFile,
): string | null {
  let before = compileTemplate(compiler, component.original)
  if (before === null || before.length > 0) {
    return null
  }
  let [message] = compileTemplate(compiler, component.switched) ?? []
  return message ?? null
}

/**
 * Compiles the top-level template of a component file.
 *
 * @param compiler - Vue template compiler.
 * @param source - Text of the component file.
 * @returns Messages of the parser and the compiler, each on one line, or null
 *   when the file parses and has no template of markup.
 */
function compileTemplate(
  compiler: VueCompiler,
  source: string,
): string[] | null {
  let errors: CompilerError[] = []
  let root = compiler.parse(source, {
    onError: error => {
      errors.push(error)
    },
    parseMode: 'sfc',
  })
  let template = findVueTemplate(root)
  if (errors.length === 0) {
    if (!template?.innerLoc) {
      return null
    }
    let { start, end } = template.innerLoc
    compiler.compile(source.slice(start.offset, end.offset), {
      onError: error => {
        errors.push(error)
      },
      prefixIdentifiers: true,
      mode: 'module',
    })
  }
  return errors.map(error => error.message.replaceAll(/\s*\n\s*/gu, ' '))
}
