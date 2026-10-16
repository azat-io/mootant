import type { TemplateOutcome } from '../../types/source/template-outcome'
import type { TemplateSource } from '../../types/source/template-source'
import type { TemplateParts } from '../../types/source/template-parts'

import { parseTemplateExpressions } from './parse-template-expressions'
import { createTemplateFailure } from './create-template-failure'
import { createCommentProgram } from './create-comment-program'

/**
 * Turns the code a framework parser found in a template into one program: oxc
 * parses the expressions, and the HTML comments of the template join the
 * comments of the program, so ignore directives can be written in them. A
 * template with comments but no expressions, or whose expressions oxc rejects,
 * is an empty program that holds only its comments, so their directives still
 * apply; a rejected expression also gives a warning.
 *
 * @param template - Path, text and expression language of the component.
 * @param parts - Expressions and HTML comments of the template.
 * @returns The program with the nodes only its synthetic module has, the event
 *   handlers and the expressions, `empty` for a template without expressions or
 *   comments, or the warning when oxc rejects an expression, which comes with
 *   the program of the comments when the template has some.
 */
export function readTemplateProgram(
  template: TemplateSource,
  parts: TemplateParts,
): TemplateOutcome {
  if (parts.expressions.length === 0 && parts.comments.length === 0) {
    return { kind: 'empty' }
  }
  let outcome =
    parts.expressions.length === 0 ?
      createCommentProgram(template)
    : parseTemplateExpressions(template, parts.expressions)
  if (outcome.kind === 'parsed') {
    return addComments(outcome, parts.comments, parts.expressions)
  }
  let failure = createTemplateFailure(template, outcome)
  if (parts.comments.length === 0) {
    return failure
  }
  return {
    ...addComments(createCommentProgram(template), parts.comments, []),
    diagnostic: failure.diagnostic,
  }
}

/**
 * Builds the template program from the program of the template code and the
 * HTML comments of the template, in source order.
 *
 * @param outcome - The program of the template code, its hosts and its event
 *   handlers.
 * @param comments - HTML comments of the template.
 * @param expressions - Template code the program holds.
 * @returns The program of the template.
 */
function addComments(
  outcome: Omit<
    Extract<TemplateOutcome, { kind: 'parsed' }>,
    'expressions' | 'diagnostic'
  >,
  comments: TemplateParts['comments'],
  expressions: TemplateParts['expressions'],
): Extract<TemplateOutcome, { kind: 'parsed' }> {
  let sorted = [...outcome.parsed.comments, ...comments].toSorted(
    (left, right) => left.start - right.start,
  )
  return {
    parsed: {
      ...outcome.parsed,
      commentEnds: new Map(sorted.map(comment => [comment.start, comment.end])),
      comments: sorted,
    },
    handlers: outcome.handlers,
    hosts: outcome.hosts,
    kind: 'parsed',
    expressions,
  }
}
