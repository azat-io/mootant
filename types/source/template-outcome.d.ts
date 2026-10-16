import type { Node } from 'oxc-parser'

import type { TemplateExpression } from './template-expression'
import type { Diagnostic } from '../mutant/diagnostic'
import type { ParsedFile } from './parsed-file'

/**
 * Template of a component as one program, nothing to mutate, or why it is not
 * mutated.
 */
export type TemplateOutcome =
  | {
      /**
       * Template code in source order, as the synthetic module holds it.
       */
      expressions: readonly TemplateExpression[]

      /**
       * Arrow functions that are event handlers, whose result is discarded.
       */
      handlers: ReadonlySet<Node>

      /**
       * Nodes that are never replaced: those only the synthetic module of the
       * expressions has, and the parts of a Vue event handler that must keep
       * their form.
       */
      hosts: ReadonlySet<Node>

      /**
       * Warning that the expressions of the template are not mutated, because
       * oxc rejects one; the program then holds only the HTML comments, so
       * their ignore directives still apply.
       */
      diagnostic?: Diagnostic
      parsed: ParsedFile
      kind: 'parsed'
    }
  | {
      /**
       * Warning that the template of the file is not mutated.
       */
      diagnostic: Diagnostic
      kind: 'failed'
    }
  | {
      kind: 'empty'
    }
