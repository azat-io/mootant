import { describe, expect, it } from 'vitest'

import type { AnalyzedProgram } from '../../../types/syntax/analyzed-program'

import { isJoinedArray } from '../../../core/syntax/is-joined-array'
import { createTestFile } from '../../helpers/create-test-file'

/**
 * Tells whether the first empty array literal of a snippet only collects the
 * parts of a string that `join('')` builds.
 *
 * @param source - Snippet with an empty array literal.
 * @param component - Whether the snippet is the script of a component, whose
 *   top level other code shares; false when omitted.
 * @returns Whether an `undefined` element first changes no string.
 */
function check(source: string, component = false): boolean {
  let file = createTestFile(source)
  let program: AnalyzedProgram = {
    shared: new Set(component ? [file.parsed.program] : []),
    scopes: file.scopes,
    tree: file.tree,
  }
  return isJoinedArray(program, file.find('ArrayExpression', '[]'))
}

describe('isJoinedArray', () => {
  it.each([
    "let parts: string[] = []; parts.push('a'); x = parts.join('')",
    'const parts = []; for (let item of items) parts.push(item); x = parts.join(``)',
    "const parts = [] as string[]; (parts as string[]).push(a, ...b); x = parts.join(('' as string))",
    "let parts = []; parts.push(a), parts.push(b); void parts.push(c); x = parts?.join('')",
    "function g() { let out = []; return () => { out.push(1); return out.join('') } }",
    "let parts = []; for (parts.push(a); ok; parts.push(b)) {} x = [parts.join(''), parts.join('')]",
  ])('holds in %s', source => {
    expect(check(source)).toBe(true)
  })

  it.each([
    "let parts = []; parts.push('a'); x = parts.join(',')",
    "let parts = []; parts.push('a'); parts.join(''); x = parts.length",
    "let parts = []; parts.push('a')",
    'let parts = []',
    "let parts = []; x = parts.push('a'); parts.join('')",
    "let parts = []; x = parts.join('') + parts.push('a')",
    "let parts = []; for (let part of parts) use(part); x = parts.join('')",
    "let parts = []; use(parts); x = parts.join('')",
    "function g() { let parts = []; parts.join(''); return parts }",
    "let parts = []; x = parts.join(); y = parts.join('')",
    "let parts = []; x = parts.join(sep); y = parts.join('')",
    "let parts = []; x = parts.join('', 1)",
    "let parts = []; x = parts.join(...['']); y = parts.join('')",
    `let parts = []; x = parts.join(\`\${a}\`); y = parts.join('')`,
    "let parts = []; x = parts['join'](''); y = parts.join('')",
    "let parts = []; parts.push.call(other, 'a'); x = parts.join('')",
    "let parts = []; x = parts.concat('a').join('')",
    "let parts = []; parts.join = g; x = parts.join('')",
    "let parts = []; parts = ['a']; x = parts.join('')",
    "var parts = []; x = parts.join('')",
    "let [first] = []; x = first.join('')",
    "x = []; y = x.join('')",
    "let parts = ok ? [] : ['a']; x = parts.join('')",
    "let parts = []; console.log(parts); x = parts.join('')",
    "let parts = []; x = parts.join(''); export { parts }",
    "let parts = []; x = parts.join(''); export default parts",
    "export const parts = []; x = parts.join('')",
    "let parts = []; eval(code); x = parts.join('')",
    "const parts = []; namespace I { namespace parts { export type P = 1 } f(parts.length) } parts.push('x'); x = parts.join('')",
  ])('does not hold in %s', source => {
    expect(check(source)).toBe(false)
  })

  it('holds for a function local of a component and not its top level', () => {
    expect(check("const labels = []; x = labels.join('')", true)).toBe(false)
    expect(check("let labels = []; x = labels.join('')", true)).toBe(false)
    expect(
      check(
        "function title() { let labels = []; labels.push(a); return labels.join('') }",
        true,
      ),
    ).toBe(true)
  })
})
