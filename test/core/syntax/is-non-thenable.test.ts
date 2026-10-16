import { describe, expect, it } from 'vitest'

import { isNonThenable } from '../../../core/syntax/is-non-thenable'
import { createTestFile } from '../../helpers/create-test-file'

/**
 * Checks the argument of the call `f(...)` on the last line of a snippet.
 *
 * @param source - Snippet whose last line is a call with one argument.
 * @returns Whether the argument is known not to be a thenable.
 */
function check(source: string): boolean {
  let { scopes, find } = createTestFile(source)
  let call = find('CallExpression', source.split('\n').at(-1))
  return isNonThenable(scopes, call.arguments[0]!)
}

describe('isNonThenable', () => {
  it.each([
    "f('done')",
    'f(1)',
    'f(1n)',
    'f(true)',
    'f(null)',
    'f(`id`)',
    `f(\`id \${value}\`)`,
    'f(-1)',
    'f(void 0)',
    'f(typeof value)',
    'f(count + 1)',
    'f(n++)',
    'f(undefined)',
    'f((undefined as never))',
    'f(() => value)',
    'f(function () {})',
    "f(ready ? 'a' : 'b')",
    "f(count > 0 && 'many')",
  ])('accepts %s', source => {
    expect(check(source)).toBe(true)
  })

  it.each([
    'f(pendingOperation)',
    'f(options.value)',
    'f(load())',
    'f(new Promise(run))',
    'f({ then: run })',
    'f({})',
    'f([])',
    'f(class { static then() {} })',
    'f(/then/)',
    "f(ready ? value : 'b')",
    "f(ready ? 'a' : value)",
    "f(value || 'none')",
    "f('none' && value)",
    'let undefined = promise\nf(undefined)',
  ])('rejects %s', source => {
    expect(check(source)).toBe(false)
  })
})
