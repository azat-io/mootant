import { describe, expect, it } from 'vitest'

import { advancesLoop } from '../../../core/syntax/advances-loop'
import { createTestFile } from '../../helpers/create-test-file'

describe('advancesLoop', () => {
  it.each([
    { source: 'while (i < n) { i++ }', type: 'UpdateExpression', text: 'i++' },
    {
      source: 'while (i < n) { i++ }',
      type: 'ExpressionStatement',
      text: 'i++',
    },
    { source: 'while (i++ < n) {}', type: 'UpdateExpression', text: 'i++' },
    {
      source: 'while (i < n) i += 2',
      type: 'AssignmentExpression',
      text: 'i += 2',
    },
    {
      source: 'for (let i = 0; i < n; i++) {}',
      type: 'UpdateExpression',
      text: 'i++',
    },
    { source: 'do { i-- } while (i)', type: 'UpdateExpression', text: 'i--' },
    {
      source: 'while (check(i)) { i = next(i) }',
      type: 'AssignmentExpression',
      text: 'i = next(i)',
    },
    {
      source: 'while (s) { s = s.slice(1) }',
      type: 'AssignmentExpression',
      text: 's = s.slice(1)',
    },
    {
      source: 'while (items.length > 0) { items.shift() }',
      type: 'ExpressionStatement',
      text: 'items.shift()',
    },
    {
      source: 'while (a) { a?.b.c() }',
      type: 'ExpressionStatement',
      text: 'a?.b.c()',
    },
    {
      source: 'while (a) { (a?.b as T).c() }',
      type: 'ExpressionStatement',
      text: '(a?.b as T).c()',
    },
    {
      source: 'while (a) { a().b() }',
      type: 'ExpressionStatement',
      text: 'a().b()',
    },
    {
      source: 'while (a) { if (b) { a.c = 1 } }',
      text: 'if (b) { a.c = 1 }',
      type: 'IfStatement',
    },
    {
      source: 'while (a) { let x = a.next() }',
      type: 'VariableDeclaration',
      text: 'let x = a.next()',
    },
    {
      source: 'while (true) { if (done) break; done = check() }',
      type: 'AssignmentExpression',
      text: 'done = check()',
    },
    {
      source: 'for (;;) { if (this.ready) break; this.ready = true }',
      type: 'AssignmentExpression',
      text: 'this.ready = true',
    },
    {
      source: 'while (f({ [key]: x })) { key++ }',
      type: 'UpdateExpression',
      text: 'key++',
    },
    {
      source: 'while (x) { while (i < n) { x = 0 } }',
      type: 'AssignmentExpression',
      text: 'x = 0',
    },
    {
      source: [
        'while (true) {',
        '  let v: T = f(() => { if (y) return })',
        '  while (true) { if (z) break }',
        '  if (done) break',
        '  done = true',
        '}',
      ].join('\n'),
      type: 'AssignmentExpression',
      text: 'done = true',
    },
    {
      source: 'while (i) { [i] = f() }',
      type: 'AssignmentExpression',
      text: '[i] = f()',
    },
    {
      source: 'while (a < 100) { [a, b] = [b, a + b] }',
      type: 'ExpressionStatement',
      text: '[a, b] = [b, a + b]',
    },
    {
      source: 'while (!done) { ({ done, value } = f()) }',
      text: '{ done, value } = f()',
      type: 'AssignmentExpression',
    },
    {
      source: 'while (!done) { ({ x: { done } } = f()) }',
      text: '{ x: { done } } = f()',
      type: 'AssignmentExpression',
    },
    {
      source: 'while (i) { [x = 0, i = 1] = f() }',
      type: 'AssignmentExpression',
      text: '[x = 0, i = 1] = f()',
    },
    {
      source: 'while (rest.length) { [, ...rest] = rest }',
      type: 'AssignmentExpression',
      text: '[, ...rest] = rest',
    },
    {
      source: 'while (s) { ({ x, ...s } = s) }',
      type: 'AssignmentExpression',
      text: '{ x, ...s } = s',
    },
    {
      source: 'while (a.b) { [a.b] = f() }',
      type: 'AssignmentExpression',
      text: '[a.b] = f()',
    },
    {
      source: [
        'outer: for (const item of items) {',
        '  while (true) {',
        '    if (i > 10) break outer',
        '    i++',
        '  }',
        '}',
      ].join('\n'),
      type: 'UpdateExpression',
      text: 'i++',
    },
    {
      source: [
        'function f() {',
        '  while (true) {',
        '    i++',
        '    while (true) { if (i > 10) return i; break }',
        '  }',
        '}',
      ].join('\n'),
      type: 'UpdateExpression',
      text: 'i++',
    },
  ] as const)('accepts $text in $source', ({ source, type, text }) => {
    let { find, tree } = createTestFile(source)

    expect(advancesLoop(tree, find(type, text))).toBe(true)
  })

  it.each([
    { source: 'while (i < n) { j++ }', type: 'UpdateExpression', text: 'j++' },
    {
      source: 'while (i < n) { j++ }',
      type: 'ExpressionStatement',
      text: 'j++',
    },
    {
      source: 'while (i < n) { other.push(i) }',
      type: 'ExpressionStatement',
      text: 'other.push(i)',
    },
    { source: 'while (i) { f() }', type: 'ExpressionStatement', text: 'f()' },
    {
      source: 'while (items.length) { items.shift() }',
      type: 'CallExpression',
      text: 'items.shift()',
    },
    {
      source: 'while (i < n) { g(() => i++) }',
      type: 'ExpressionStatement',
      text: 'g(() => i++)',
    },
    {
      source: 'while (i < n) { g(() => i++) }',
      type: 'UpdateExpression',
      text: 'i++',
    },
    {
      source: 'while (i) { function g() { i++ } }',
      text: 'function g() { i++ }',
      type: 'FunctionDeclaration',
    },
    {
      source: 'for (i = 0; i < n; i++) {}',
      type: 'AssignmentExpression',
      text: 'i = 0',
    },
    { source: 'while (i) { x + i }', type: 'BinaryExpression', text: 'x + i' },
    {
      source: 'while (i) { [j, , ...k] = f() }',
      type: 'AssignmentExpression',
      text: '[j, , ...k] = f()',
    },
    {
      source: 'while (i) { ({ i: j, k = i } = f()) }',
      text: '{ i: j, k = i } = f()',
      type: 'AssignmentExpression',
    },
    {
      source: 'while (a.b < c) { b++ }',
      type: 'UpdateExpression',
      text: 'b++',
    },
    {
      source: 'while (f({ key: x })) { key++ }',
      type: 'UpdateExpression',
      text: 'key++',
    },
    {
      source: 'while (import.meta.x) { meta++ }',
      type: 'UpdateExpression',
      text: 'meta++',
    },
    {
      source: 'while (x as Limit) { Limit++ }',
      type: 'UpdateExpression',
      text: 'Limit++',
    },
    {
      source: 'while (check(() => y)) { y++ }',
      type: 'UpdateExpression',
      text: 'y++',
    },
    {
      source: 'while (true) { y++ }',
      type: 'UpdateExpression',
      text: 'y++',
    },
    {
      source: 'while (x) { while (true) { if (y) break }; y++ }',
      type: 'UpdateExpression',
      text: 'y++',
    },
    { type: 'UpdateExpression', source: 'i++', text: 'i++' },
  ] as const)('rejects $text in $source', ({ source, type, text }) => {
    let { find, tree } = createTestFile(source)

    expect(advancesLoop(tree, find(type, text))).toBe(false)
  })

  it('reads the names of a loop once', () => {
    let { find, tree } = createTestFile('while (i < n) { i++; j++ }')

    expect(advancesLoop(tree, find('UpdateExpression', 'i++'))).toBe(true)
    expect(advancesLoop(tree, find('UpdateExpression', 'j++'))).toBe(false)
  })

  it('throws for a node outside the runtime tree', () => {
    let { tree } = createTestFile('while (i) { i++ }')
    let other = createTestFile('while (i) { i++ }')

    expect(() => advancesLoop(tree, other.find('UpdateExpression'))).toThrow(
      'Node is not part of the runtime tree of the file.',
    )
  })
})
