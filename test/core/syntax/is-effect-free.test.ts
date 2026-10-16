import { describe, expect, it } from 'vitest'

import { isEffectFree } from '../../../core/syntax/is-effect-free'
import { createTestFile } from '../../helpers/create-test-file'

/**
 * Checks the value assigned to `x` in a snippet.
 *
 * @param source - Value of `x`.
 * @returns Whether the value is free of effects.
 */
function check(source: string): boolean {
  let { find } = createTestFile(`x = ${source}`)
  return isEffectFree(find('AssignmentExpression').right)
}

describe('isEffectFree', () => {
  it.each([
    '100',
    'seconds * 1000',
    'options.delay ?? 300',
    'a?.b[0]',
    'quick ? 1 : 4000',
    '-n',
    `\`\${a}\``,
    '(n as number)',
    '[a, b]',
    '{ a: 1 }',
  ])('accepts %s', source => {
    expect(check(source)).toBe(true)
  })

  it.each([
    'f()',
    'a.b()',
    'new A()',
    'tag`a`',
    "import('a')",
    '(y = 1)',
    'n++',
    'delete a.b',
    '[...items]',
    '() => 1',
    'function () {}',
    'class {}',
    'a + f()',
    '{ get a() { return 1 } }',
  ])('rejects %s', source => {
    expect(check(source)).toBe(false)
  })

  it.each([
    'async function f() { x = await a }',
    'function* f() { x = yield a }',
  ])('rejects await and yield in %s', source => {
    let { find } = createTestFile(source)

    expect(isEffectFree(find('AssignmentExpression').right)).toBe(false)
  })
})
