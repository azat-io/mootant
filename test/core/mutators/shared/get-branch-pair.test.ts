import { describe, expect, it } from 'vitest'

import { getBranchPair } from '../../../../core/mutators/shared/get-branch-pair'
import { createTestContext } from '../../../helpers/create-test-context'

describe('getBranchPair', () => {
  it.each<{ forced: boolean; source: string; other: string; test: string }>([
    { source: 'x = t ? a : b', forced: false, other: 'b', test: 't' },
    { source: 'x = (t) ? b : (a)', forced: true, other: 'b', test: 't' },
    {
      source: 'x = t ? (a as number) : b',
      forced: false,
      other: 'b',
      test: 't',
    },
    {
      source: 'function f() { if (t) return a; return (b) }',
      forced: false,
      other: 'b',
      test: 't',
    },
    {
      source: 'function f() { if (t) return b; return a }',
      forced: true,
      other: 'b',
      test: 't',
    },
    {
      source: 'function f() { if ((t)) { return a } else { return b } }',
      forced: false,
      other: 'b',
      test: 't',
    },
    {
      source: 'function f() { if (t) return b; else return a }',
      forced: true,
      other: 'b',
      test: 't',
    },
    {
      source: 'function f() { if (u) { if (t) return b; return a } }',
      forced: true,
      other: 'b',
      test: 't',
    },
    {
      source:
        'function f() { switch (u) { case 1: if (t) return a; return b } }',
      forced: false,
      other: 'b',
      test: 't',
    },
  ])('pairs a in $source', ({ source, forced, other, test }) => {
    let { context, find } = createTestContext(source)
    let pair = getBranchPair(find('Identifier', 'a'), context)!

    expect(context.sourceCode.getText(pair.other)).toBe(other)
    expect(context.sourceCode.getText(pair.test)).toBe(test)
    expect(pair.forced).toBe(forced)
  })

  it.each([
    'x = a ? b : c',
    'x = f(a)',
    'function f() { if (t) return a; foo(); return b }',
    'function f() { if (t) return a; else foo() }',
    'function f() { if (t) return a; else if (u) return b; else return c }',
    'function f() { if (t) foo(); else return a }',
    'function f() { if (t) return a }',
    'function f() { if (t) return a; { return b } }',
    'function f() { if (t) { foo(); return a } return b }',
    'function f() { if (t) return a; else return }',
    'function f() { return a }',
    'function f() { foo(); return a }',
    'function f() { if (t) { foo(); return b } return a }',
    'function f() { if (t) return b; else foo(); return a }',
    'function f() { while (t) return a }',
    'function f() { while (u) if (t) return a }',
  ])('finds no pair for a in %s', source => {
    let { context, find } = createTestContext(source)

    expect(getBranchPair(find('Identifier', 'a'), context)).toBeNull()
  })
})
