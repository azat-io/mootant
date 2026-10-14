import { describe, expect, it } from 'vitest'

import type { TestContextSetup } from '../../../helpers/create-test-context'

import { createRunContext } from '../../../../core/mutators/shared/create-run-context'
import { getGroupConstant } from '../../../../core/mutators/shared/get-group-constant'
import { createTestContext } from '../../../helpers/create-test-context'

describe('getGroupConstant', () => {
  it.each<{
    setup: TestContextSetup
    expected: boolean
    source: string
    group: string
  }>([
    {
      source: 'if (isMember && isActive) run()',
      group: 'isMember && isActive',
      expected: true,
      setup: {},
    },
    {
      source: 'if (a && b && c) {}',
      group: 'a && b && c',
      expected: true,
      setup: {},
    },
    {
      source: 'if (a && b && c) {}',
      group: 'a && b',
      expected: false,
      setup: {},
    },
    {
      source: 'if (a && b || c) {}',
      group: 'a && b || c',
      expected: false,
      setup: {},
    },
    {
      source: 'if (!(a && b) || c) {}',
      group: 'a && b',
      expected: false,
      setup: {},
    },
    {
      source: 'if ((c || a) && (b || (!d && e))) {}',
      group: '(c || a) && (b || (!d && e))',
      expected: false,
      setup: {},
    },
    {
      source: 'let a: number; if (a > 0 && isActive) {}',
      group: 'a > 0 && isActive',
      expected: false,
      setup: {},
    },
    {
      source: 'let n: number; if (n !== 0 || flag) {}',
      group: 'n !== 0 || flag',
      expected: true,
      setup: {},
    },
    {
      source: 'while (i < n && !done) step()',
      group: 'i < n && !done',
      expected: true,
      setup: {},
    },
    {
      source: 'while (a || b) step()',
      group: 'a || b',
      expected: false,
      setup: {},
    },
    {
      source: 'while (a || b) step()',
      setup: { timeouts: true },
      group: 'a || b',
      expected: true,
    },
    {
      source: 'for (;;) { if (a || b) break }',
      group: 'a || b',
      expected: false,
      setup: {},
    },
    {
      source: 'for (;;) { step(); if (a && b) break }',
      group: 'a && b',
      expected: false,
      setup: {},
    },
    {
      source: 'for (;;) { step(); if (!(a && b)) break }',
      group: 'a && b',
      expected: true,
      setup: {},
    },
    {
      source: 'rows.filter(r => r.a || r.b)',
      group: 'r.a || r.b',
      expected: true,
      setup: {},
    },
    {
      source: 'rows.filter(r => r.a && r.b)',
      group: 'r.a && r.b',
      expected: true,
      setup: {},
    },
    {
      source:
        'interface User {} function f(u: User) { if (!(u === null) || flag) {} }',
      group: '!(u === null) || flag',
      expected: false,
      setup: {},
    },
    {
      source: 'if (ok && true) {}',
      group: 'ok && true',
      expected: true,
      setup: {},
    },
    {
      source: 'function f(a, b): boolean { return a && b }',
      group: 'a && b',
      expected: true,
      setup: {},
    },
    {
      source: 'if (ok && false) {}',
      group: 'ok && false',
      expected: false,
      setup: {},
    },
    {
      source: 'x = a < b || !c',
      group: 'a < b || !c',
      expected: false,
      setup: {},
    },
    { source: 'x = !a || !c', group: '!a || !c', expected: true, setup: {} },
    {
      source: 'x = !a || !!true',
      group: '!a || !!true',
      expected: false,
      setup: {},
    },
    {
      source: 'function f(x: boolean | undefined) { if (a && (x ?? true)) {} }',
      group: 'a && (x ?? true)',
      expected: false,
      setup: {},
    },
    {
      source: 'function f(u) { return u.isOwner && u.isActive }',
      group: 'u.isOwner && u.isActive',
      setup: { file: 'example.js' },
      expected: true,
    },
    {
      source: 'function f(x) { return x === 0 && isValid(x) }',
      group: 'x === 0 && isValid(x)',
      setup: { file: 'example.js' },
      expected: true,
    },
    {
      source: 'function f(user) { return user && user.age > 18 }',
      group: 'user && user.age > 18',
      setup: { file: 'example.js' },
      expected: false,
    },
    {
      source: 'function f(x, y, z) { return x === 0 && y > 3 && isOk(z) }',
      group: 'x === 0 && y > 3 && isOk(z)',
      setup: { file: 'example.js' },
      expected: false,
    },
    {
      source: 'function f(user) { x = user && user.name }',
      setup: { file: 'example.js' },
      group: 'user && user.name',
      expected: false,
    },
    {
      source: 'function f(u) { return u.a && 1 }',
      setup: { file: 'example.js' },
      group: 'u.a && 1',
      expected: false,
    },
    {
      source: 'x = rows.toSorted((a, b) => a.pinned && compare(a, b))',
      group: 'a.pinned && compare(a, b)',
      setup: { file: 'example.js' },
      expected: true,
    },
    {
      source: 'x = rows.sort((a, b) => a.pinned && compare(a, b))',
      group: 'a.pinned && compare(a, b)',
      setup: { file: 'example.js' },
      expected: false,
    },
    {
      source: 'x = rows.toSorted((a, b) => a.pinned || compare(a, b))',
      group: 'a.pinned || compare(a, b)',
      setup: { file: 'example.js' },
      expected: true,
    },
  ])(
    'decides the constant of $source',
    ({ expected, source, group, setup }) => {
      let { context, find } = createTestContext(source, setup)

      expect(
        getGroupConstant(
          find('LogicalExpression', group),
          createRunContext(context),
        ).emitted,
      ).toBe(expected)
    },
  )

  it.each<[string, boolean]>([
    [
      [
        'function f(x, y, z) {',
        '  // mootant-ignore-next-line comparison-operator',
        '  return x === 0 && y > 3 && isOk(z)',
        '}',
      ].join('\n'),
      true,
    ],
    [
      [
        'function f(x, y, z) {',
        '  // mootant-ignore-next-line logical-operator',
        '  return x === 0 && y > 3 && isOk(z)',
        '}',
      ].join('\n'),
      false,
    ],
  ])('follows ignore comments in %s', (source, expected) => {
    let { context, find } = createTestContext(source, { file: 'example.js' })

    expect(
      getGroupConstant(
        find('LogicalExpression', 'x === 0 && y > 3 && isOk(z)'),
        createRunContext(context),
      ).emitted,
    ).toBe(expected)
  })

  it.each<{ rule: string | null; source: string; group: string }>([
    { source: 'if (a && b && c) {}', group: 'a && b', rule: null },
    {
      source: 'if (isMember && isActive) run()',
      group: 'isMember && isActive',
      rule: null,
    },
    {
      source: 'function f(user) { x = user && user.name }',
      group: 'user && user.name',
      rule: null,
    },
    {
      source: 'if (ok && false) {}',
      rule: 'fixed-operand',
      group: 'ok && false',
    },
    { source: 'while (a || b) step()', rule: 'loop-running', group: 'a || b' },
    { source: 'for (;;) { if (a || b) break }', group: 'a || b', rule: 'O13' },
    {
      source: 'x = rows.sort((a, b) => a.pinned && compare(a, b))',
      group: 'a.pinned && compare(a, b)',
      rule: 'O12',
    },
    {
      source: 'function f(x, y, z) { return x === 0 && y > 3 && isOk(z) }',
      group: 'x === 0 && y > 3 && isOk(z)',
      rule: 'R2',
    },
    {
      source: 'if ((c || a) && (b || (!d && e))) {}',
      group: '(c || a) && (b || (!d && e))',
      rule: 'R2',
    },
  ])(
    'names the rule that skips the constant of $source',
    ({ source, group, rule }) => {
      let { context, find } = createTestContext(source, { file: 'example.js' })

      expect(
        getGroupConstant(
          find('LogicalExpression', group),
          createRunContext(context),
        ).skip?.rule ?? null,
      ).toBe(rule)
    },
  )
})
