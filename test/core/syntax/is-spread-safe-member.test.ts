import type { ObjectPropertyKind } from 'oxc-parser'

import { describe, expect, it } from 'vitest'

import { isSpreadSafeMember } from '../../../core/syntax/is-spread-safe-member'
import { createTestFile } from '../../helpers/create-test-file'

describe('isSpreadSafeMember', () => {
  it.each([
    { source: 'x = { ...base, a }', member: '...base', expected: true },
    { source: 'x = { a: 1, b }', member: 'a: 1', expected: true },
    { source: 'x = { b, a }', expected: true, member: 'b' },
    { source: 'x = { [key]: 1 }', member: '[key]: 1', expected: true },
    {
      source: 'x = { run() { return this.a } }',
      member: 'run() { return this.a }',
      expected: true,
    },
    {
      source: 'class A extends B { m() { return { arrow: () => super.a } } }',
      member: 'arrow: () => super.a',
      expected: true,
    },
    {
      source: 'x = { get a() { return 1 } }',
      member: 'get a() { return 1 }',
      expected: false,
    },
    {
      source: 'x = { set a(value) {} }',
      member: 'set a(value) {}',
      expected: false,
    },
    {
      source: 'x = { run() { return super.run() } }',
      member: 'run() { return super.run() }',
      expected: false,
    },
    {
      source: 'x = { run() { return () => super.run() } }',
      member: 'run() { return () => super.run() }',
      expected: false,
    },
    {
      source: 'x = { __proto__: base }',
      member: '__proto__: base',
      expected: false,
    },
    {
      source: "x = { '__proto__': base }",
      member: "'__proto__': base",
      expected: false,
    },
    {
      source: "x = { ['__proto__']: base }",
      member: "['__proto__']: base",
      expected: false,
    },
    { source: 'x = { __proto__ }', member: '__proto__', expected: false },
    {
      source: 'x = { __proto__() {} }',
      member: '__proto__() {}',
      expected: false,
    },
    {
      source: 'x = { [`__proto__`]: base }',
      member: '[`__proto__`]: base',
      expected: false,
    },
    {
      source: "x = { [('__proto__' as const)]: base }",
      member: "[('__proto__' as const)]: base",
      expected: false,
    },
    {
      source: `x = { [\`proto\${key}\`]: base }`,
      member: `[\`proto\${key}\`]: base`,
      expected: true,
    },
    {
      source: "x = { run() { return eval('super.run()') } }",
      member: "run() { return eval('super.run()') }",
      expected: false,
    },
    {
      source: "x = { run() { return (eval)('this.a') } }",
      member: "run() { return (eval)('this.a') }",
      expected: false,
    },
    {
      source: "x = { run() { return eval!('super.run()') } }",
      member: "run() { return eval!('super.run()') }",
      expected: false,
    },
    {
      source: "x = { run() { return (eval as Function)('super.run()') } }",
      member: "run() { return (eval as Function)('super.run()') }",
      expected: false,
    },
    {
      source: "x = { run() { return parse('this.a') } }",
      member: "run() { return parse('this.a') }",
      expected: true,
    },
  ])(
    'tells whether $member spreads alike in $source',
    ({ expected, member, source }) => {
      let { find } = createTestFile(source)
      let node = find(
        member.startsWith('...') ? 'SpreadElement' : 'Property',
        member,
      )

      expect(isSpreadSafeMember(node as ObjectPropertyKind)).toBe(expected)
    },
  )
})
