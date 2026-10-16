import type { TemplateOutcome } from '../../types/source/template-outcome'
import type { SvelteCompiler } from '../../types/source/svelte-compiler'
import type { TemplateSource } from '../../types/source/template-source'
import type { TemplateParts } from '../../types/source/template-parts'

import { collectSvelteExpressions } from './collect-svelte-expressions'
import { createTemplateFailure } from './create-template-failure'
import { readTemplateProgram } from './read-template-program'

/**
 * Error of the Svelte parser, which tells where the problem starts.
 */
interface SvelteParseError {
  /**
   * Position of the problem, when the parser knows it.
   */
  start?: { character: number }

  /**
   * Message of the parser.
   */
  message: string
}

/**
 * Reads the template of a Svelte 5 component as one program: Svelte parses the
 * file, and oxc parses the expressions it finds. The HTML comments of the
 * template become block comments of the program, so ignore directives can be
 * written in them. When Svelte or oxc rejects the file, its template is not
 * mutated and a warning says why, though the HTML comments still hold ignore
 * directives when only oxc rejects it; its script blocks are mutated as usual.
 * Svelte drops a leading byte order mark from the offsets it gives, so the mark
 * is read as a space.
 *
 * @param compiler - Svelte compiler of the project.
 * @param template - Path, text and expression language of the component.
 * @returns The program with the nodes only its synthetic module has, the event
 *   handlers and the expressions, `empty` for a template without expressions or
 *   comments, or the warning, which comes with the program of the HTML comments
 *   when only oxc rejects an expression.
 */
export function parseSvelteTemplate(
  compiler: SvelteCompiler,
  template: TemplateSource,
): TemplateOutcome {
  let { source } = template
  let read = source.codePointAt(0) === 0xfe_ff ? ` ${source.slice(1)}` : source
  let parts: TemplateParts
  try {
    parts = collectSvelteExpressions(compiler.parse(read, { modern: true }))
  } catch (error) {
    let { message, start } = error as SvelteParseError
    return createTemplateFailure(template, {
      offset: start?.character ?? null,
      message,
    })
  }
  return readTemplateProgram(template, parts)
}
