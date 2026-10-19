import { describe, expect, it } from 'vitest'

import { isPlainMessage } from '../../../core/syntax/is-plain-message'
import { createTestFile } from '../../helpers/create-test-file'

/**
 * Checks the value assigned to `x` in a snippet.
 *
 * @param source - Value of `x`.
 * @returns Whether the value is a plain message.
 */
function check(source: string): boolean {
  let { find } = createTestFile(`x = ${source}`)
  return isPlainMessage(find('AssignmentExpression').right)
}

describe('isPlainMessage', () => {
  it.each([
    "'a'",
    '1',
    'true',
    'null',
    '2n',
    '`a`',
    `\`a \${b} \${c}\``,
    `'a' + 1 + (\`b \${c}\` as string)`,
  ])('accepts %s', source => {
    expect(check(source)).toBe(true)
  })

  it.each([
    'a',
    '-1',
    'user.name',
    'n * 0n',
    "'a' + b",
    "'a' - 1",
    `\`a \${b.c}\``,
    `\`a \${f()}\``,
    "ok ? 'a' : 'b'",
  ])('rejects %s', source => {
    expect(check(source)).toBe(false)
  })
})
