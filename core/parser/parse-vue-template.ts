import type { TemplateOutcome } from '../../types/source/template-outcome'
import type { TemplateSource } from '../../types/source/template-source'
import type { TemplateParts } from '../../types/source/template-parts'
import type { VueCompiler } from '../../types/source/vue-compiler'

import { collectVueExpressions } from './collect-vue-expressions'
import { createTemplateFailure } from './create-template-failure'
import { readTemplateProgram } from './read-template-program'

/**
 * Error of the Vue parser, which tells where the problem starts.
 */
interface VueParseError {
  /**
   * Location of the problem, when the parser knows it.
   */
  loc?: { start: { offset: number } }

  /**
   * Message of the parser.
   */
  message: string
}

/**
 * Reads the template of a Vue 3 component as one program: Vue parses the file
 * as a single-file component, and oxc parses the expressions it finds. The HTML
 * comments of the template become block comments of the program, so ignore
 * directives can be written in them. When Vue or oxc rejects the file, its
 * template is not mutated and a warning says why, though the HTML comments
 * still hold ignore directives when only oxc rejects it; its script blocks are
 * mutated as usual.
 *
 * @param compiler - Vue template compiler of the project.
 * @param template - Path, text and expression language of the component.
 * @returns The program with the nodes only its synthetic module has, the event
 *   handlers and the expressions, `empty` for a template without expressions or
 *   comments, or the warning, which comes with the program of the HTML comments
 *   when only oxc rejects an expression.
 */
export function parseVueTemplate(
  compiler: VueCompiler,
  template: TemplateSource,
): TemplateOutcome {
  let { source } = template
  let parts: TemplateParts
  try {
    parts = collectVueExpressions(
      compiler.parse(source, { parseMode: 'sfc', comments: true }),
      source,
    )
  } catch (error) {
    let { message, loc } = error as VueParseError
    return createTemplateFailure(template, {
      offset: loc?.start.offset ?? null,
      message,
    })
  }
  return readTemplateProgram(template, parts)
}
