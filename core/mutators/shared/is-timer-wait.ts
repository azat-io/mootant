import type { AwaitExpression } from 'oxc-parser'

import type { MutatorContext } from '../../../types/mutator/mutator-context'

/**
 * Tells whether an `await` only waits for a timer: its argument is a call of a
 * promise timer, such as `setTimeout(1000)` of `node:timers/promises` or
 * `scheduler.wait(1000)`, without options that may carry an abort signal and
 * without a value that may be a thenable, whose state the timer promise takes
 * on (architecture `readTimerCall`), and nothing reads the awaited value.
 * Without the `await`, or without the statement, the code only runs earlier.
 *
 * @param node - Await expression.
 * @param context - Mutator context of the file.
 * @returns Whether the `await` only waits for a delay.
 */
export function isTimerWait(
  node: AwaitExpression,
  context: MutatorContext,
): boolean {
  let { syntax } = context
  let call = syntax.unwrapExpression(node.argument)
  return (
    call.type === 'CallExpression' &&
    syntax.readTimerCall(call)?.waits === true &&
    syntax.isResultUnused(node)
  )
}
