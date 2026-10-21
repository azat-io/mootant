import type { AssignmentExpression, UpdateExpression } from 'oxc-parser'

import { describe, expect, it } from 'vitest'

import type { AnalyzedProgram } from '../../../types/syntax/analyzed-program'
import type { ValueBound } from '../../../types/syntax/value-bound'

import { getGuardBound } from '../../../core/syntax/get-guard-bound'
import { createTestFile } from '../../helpers/create-test-file'
import { walkTree } from '../../../core/tree/walk-tree'

/**
 * Bound that a guard gives, with the text of the comparisons it rests on.
 */
type GuardResult = Omit<ValueBound, 'guards'> & { guards: string[] }

/**
 * Finds the bound that the guard of the last decrement of a snippet gives.
 *
 * @param source - Snippet with a decrement, `x--` or `x -= k`.
 * @param current - Bound of the name before the guard, over an integer that is
 *   at least 0.
 * @returns Bound of the name right after the guard, with the text of its
 *   guards, or null.
 */
function guardOf(
  source: string,
  current: Partial<ValueBound> = {},
): GuardResult | null {
  let file = createTestFile(
    `declare let o: { x: number }\nlet x = 0\n${source}`,
  )
  let decrement: AssignmentExpression | UpdateExpression | null = null
  walkTree(file.parsed.program, node => {
    if (
      (node.type === 'UpdateExpression' && node.operator === '--') ||
      (node.type === 'AssignmentExpression' && node.operator === '-=')
    ) {
      decrement = node
    }
    return true
  })
  let program: AnalyzedProgram = {
    scopes: file.scopes,
    shared: new Set(),
    tree: file.tree,
  }
  let bound = getGuardBound(program, decrement!, {
    nullable: false,
    integer: true,
    because: '',
    lower: 0,
    ...current,
  })
  return (
    bound && {
      ...bound,
      guards: [...bound.guards!].map(guard => file.sourceCode.getText(guard)),
    }
  )
}

describe('getGuardBound', () => {
  it.each<{
    comparison?: string
    source: string
    guard: string
    lower: number
  }>([
    { source: 'if (x > 0) x--', guard: 'x > 0', lower: 1 },
    { source: 'if (x > 0) { x -= 1; use(x) }', guard: 'x > 0', lower: 1 },
    { source: 'while (x > 0) x--', guard: 'x > 0', lower: 1 },
    { source: 'while (x > 0) { --x; use(x) }', guard: 'x > 0', lower: 1 },
    { source: 'if (a && b && x >= 2) x -= 2', guard: 'x >= 2', lower: 2 },
    { source: 'if (a && (b && x > 0)) x--', guard: 'x > 0', lower: 1 },
    { source: 'if ((x > 0)) (x--)', guard: 'x > 0', lower: 1 },
    {
      source: 'if ((x as number) > 0) x--',
      comparison: '(x as number) > 0',
      guard: 'x > 0',
      lower: 1,
    },
    { source: 'if (0 < x) x--', guard: '0 < x', lower: 1 },
    { source: 'if (3 <= x) x--', guard: '3 <= x', lower: 3 },
    { source: 'if (0x10 < x) x--', guard: '0x10 < x', lower: 17 },
    { source: 'if (-1 < x) x--', guard: '-1 < x', lower: 0 },
    { source: 'if (x >= 1_000) x -= 2', guard: 'x >= 1_000', lower: 1000 },
    { source: 'if (x > -1) x--', guard: 'x > -1', lower: 0 },
    { source: 'if (x !== 0) x--', guard: 'x !== 0', lower: 1 },
    { source: 'if (x != 0) x--', guard: 'x != 0', lower: 1 },
    { source: 'if (x > 0.5) x--', guard: 'x > 0.5', lower: 0.5 },
    {
      source: "if (c === '(') x++\nelse if (c === ')' && x > 0) x -= 1",
      guard: 'x > 0',
      lower: 1,
    },
  ])(
    'bounds the name after $source',
    ({ comparison, source, guard, lower }) => {
      expect(guardOf(source)).toStrictEqual({
        because: `right after \`${guard}\``,
        guards: [comparison ?? guard],
        nullable: false,
        integer: true,
        lower,
      })
    },
  )

  it('gives the literal of > for a name that may not be an integer', () => {
    expect(guardOf('if (x > 0) x--', { integer: false })).toStrictEqual({
      because: 'right after `x > 0`',
      guards: ['x > 0'],
      nullable: false,
      integer: false,
      lower: 0,
    })
  })

  it.each([
    'if (x > 0 && foo()) x--',
    'if (x > 0 && probe.closing) x--',
    'if (foo() || x > 0) x--',
    'if (x > 0) { use(x); x-- }',
    'if (x > 0) {} else x--',
    'if (x < 5) x--',
    'if (x <= 5) x--',
    'if (5 > x) x--',
    'if (5 >= x) x--',
    'if (x === 5) x--',
    'if (x !== 3) x--',
    'if (y > 0) x--',
    'if (x > y) x--',
    'if (x > 0) use(x--)',
    'if (x > 0) x--, use(x)',
    'do { x-- } while (x > 0)',
    'for (; x > 0; ) x--',
    'if (x > 0) console.log(x--)',
    'if (o.x > 0) o.x--',
    'if (!(x <= 0)) x--',
    'if (f(x > 0)) x--',
    'class A { @dec(x--) m() {} }',
    'x--',
  ])('gives no bound after %s', source => {
    expect(guardOf(source)).toBeNull()
  })

  it('gives no bound after !== for a name that may not be an integer', () => {
    expect(guardOf('if (x !== 0) x--', { integer: false })).toBeNull()
  })
})
