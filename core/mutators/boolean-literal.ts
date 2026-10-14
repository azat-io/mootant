import type { Mutator } from '../../types/mutator'

import { isNoOpCallbackLiteral } from './shared/is-no-op-callback-literal'
import { isBooleanModeOperand } from './shared/is-boolean-mode-operand'
import { isBranchCopySkipped } from './shared/is-branch-copy-skipped'
import { isComparisonOperand } from './shared/is-comparison-operand'
import { isOrDefaultSkipped } from './shared/is-or-default-skipped'
import { createRunContext } from './shared/create-run-context'
import { getRunningValue } from './shared/get-running-value'
import { isVoidOperand } from './shared/is-void-operand'

/**
 * Inverts a boolean literal (catalog 4.5). Skipped: a comparison operand (the
 * comparison owns it, O4) and a boolean-mode operand (logical-operator owns it,
 * O3); a `void` operand, whose flip changes nothing (EQ); a flip after which a
 * return switch empties a no-op callback (method-call owns it, O12); a flip
 * that copies the other branch of a branch pair, or a flipped branch next to a
 * boolean-valued branch, when the test's owner emits that constant (O19) or a
 * mutant that will run moves the test toward it (R5); the right operand of a
 * value-mode `L || true` with a nullable boolean `L` while the `??` swap will
 * run (R7); and a flip toward the running value of a loop unless the `timeouts`
 * setting is on (TIMEOUT).
 */
export let booleanLiteral: Mutator = {
  create(context) {
    let runContext = createRunContext(context)
    return {
      Literal(node) {
        if (typeof node.value !== 'boolean') {
          return []
        }
        let value = !node.value
        if (
          isComparisonOperand(node, context) ||
          isBooleanModeOperand(node, context) ||
          isVoidOperand(node, context) ||
          isNoOpCallbackLiteral(node, value, context) ||
          isBranchCopySkipped(node, { value }, runContext) ||
          isOrDefaultSkipped(node, value, runContext) ||
          (!context.settings.timeouts &&
            getRunningValue(node, context)?.value === value)
        ) {
          return []
        }
        return [{ text: String(value), node }]
      },
    }
  },
  meta: {
    description: 'Inverts a boolean literal.',
  },
}
