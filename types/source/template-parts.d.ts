import type { Comment } from 'oxc-parser'

import type { TemplateExpression } from './template-expression'

/**
 * Code of a component template that mootant reads.
 */
export interface TemplateParts {
  /**
   * Expressions and declaration tags to mutate, in source order.
   */
  expressions: TemplateExpression[]

  /**
   * HTML comments of the template as block comments, in source order, so that
   * ignore directives can be written in them.
   */
  comments: Comment[]
}
