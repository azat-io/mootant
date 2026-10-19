import { describe, expect, it } from 'vitest'

import { isFormatFree } from '../../../core/syntax/is-format-free'
import { createTestFile } from '../../helpers/create-test-file'

/**
 * Checks the value assigned to `x` in a snippet.
 *
 * @param source - Value of `x`.
 * @returns Whether the value is free of format directives.
 */
function check(source: string): boolean {
  let { find } = createTestFile(`x = ${source}`)
  return isFormatFree(find('AssignmentExpression').right)
}

describe('isFormatFree', () => {
  it.each(["'debug'", '1', 'null', '`a`', "('a' as string)"])(
    'accepts %s',
    source => {
      expect(check(source)).toBe(true)
    },
  )

  it.each([
    "'%j'",
    "'total %d'",
    '`%s`',
    `\`a \${b}\``,
    "'a' + 'b'",
    String.raw`'\x25j'`,
    '`\\x25j`',
    'format',
    'user.name',
  ])('rejects %s', source => {
    expect(check(source)).toBe(false)
  })

  it('rejects a template whose value is unknown', () => {
    let { find } = createTestFile('x = `a`')
    let template = find('TemplateLiteral')
    template.quasis[0]!.value.cooked = null

    expect(isFormatFree(template)).toBe(false)
  })
})
