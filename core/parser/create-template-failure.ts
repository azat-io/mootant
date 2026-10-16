import type { TemplateOutcome } from '../../types/source/template-outcome'
import type { TemplateSource } from '../../types/source/template-source'

import { getSourcePosition } from '../text/get-source-position'
import { getLineStarts } from '../text/get-line-starts'

/**
 * Builds the warning of a template that is not mutated because a parser
 * rejected it.
 *
 * @param template - Path and text of the component.
 * @param problem - What the parser rejected.
 * @param problem.message - Message of the parser; its line breaks become
 *   spaces.
 * @param problem.offset - Offset of the problem, or null without a location.
 * @returns The failed outcome with its warning.
 */
export function createTemplateFailure(
  template: TemplateSource,
  problem: { offset: number | null; message: string },
): Extract<TemplateOutcome, { kind: 'failed' }> {
  let { message, offset } = problem
  let { source, file } = template
  let position =
    offset === null ?
      { column: null, line: null }
    : getSourcePosition(getLineStarts(source), offset)
  return {
    diagnostic: {
      message: `The template is not mutated, because it does not parse: ${message.replaceAll(/\s*\n\s*/gu, ' ')}`,
      code: 'template-skipped',
      severity: 'warning',
      ...position,
      file,
    },
    kind: 'failed',
  }
}
