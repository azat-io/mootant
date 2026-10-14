import { describe, expect, it } from 'vitest'

import { getExitedLoops } from '../../../core/syntax/get-exited-loops'
import { createTestFile } from '../../helpers/create-test-file'

describe('getExitedLoops', () => {
  it.each([
    { source: 'while (true) { if (a) break }', loops: ['WhileStatement'] },
    {
      source: 'while (true) { if (a) { f(); break } }',
      loops: ['WhileStatement'],
    },
    {
      source: 'while ((1 as number)) { if (a) break }',
      loops: ['WhileStatement'],
    },
    { source: "while ('yes') { if (a) break }", loops: ['WhileStatement'] },
    { source: 'while (/x/) { if (a) break }', loops: ['WhileStatement'] },
    { source: 'for (;;) { if (a) break }', loops: ['ForStatement'] },
    { source: 'for (; 1;) { if (a) break }', loops: ['ForStatement'] },
    { source: 'do { if (a) break } while (true)', loops: ['DoWhileStatement'] },
    {
      source: 'while (true) { { if (a) { break } } }',
      loops: ['WhileStatement'],
    },
    {
      source: 'function f() { for (;;) { for (x of y) { if (a) return } } }',
      loops: ['ForStatement'],
    },
    {
      source: 'function f() { for (;;) { do { if (a) return } while (1) } }',
      loops: ['DoWhileStatement', 'ForStatement'],
    },
    {
      source: 'function f() { while (x) { for (;;) { if (a) return } } }',
      loops: ['ForStatement'],
    },
    {
      source: 'outer: while (true) { for (x of y) { if (a) break outer } }',
      loops: ['WhileStatement'],
    },
    {
      source: 'outer: while (true) { inner: while (x) { if (a) break outer } }',
      loops: ['WhileStatement'],
    },
    {
      source: 'outer: for (x of y) { while (true) { if (a) break outer } }',
      loops: ['WhileStatement'],
    },
    {
      source: 'outer: for (;;) { do { if (a) break outer } while (1) }',
      loops: ['DoWhileStatement', 'ForStatement'],
    },
    {
      source: 'block: { while (true) { if (a) break block } }',
      loops: ['WhileStatement'],
    },
    {
      source: 'for (;;) { inner: do { if (a) break inner } while (1) }',
      loops: ['DoWhileStatement'],
    },
    {
      source: 'outer: for (x of y) { while (true) { if (a) continue outer } }',
      loops: ['WhileStatement'],
    },
    {
      source: 'outer: for (;;) { do { if (a) continue outer } while (1) }',
      loops: ['DoWhileStatement'],
    },
  ] as const)('finds $loops of $source', ({ source, loops }) => {
    let { find, tree } = createTestFile(source)

    expect(getExitedLoops(tree, find('IfStatement'))).toStrictEqual(
      loops.map(type => find(type)),
    )
  })

  it.each([
    'while (true) { if (a) { break; f() } }',
    'while (true) { if (a) {} }',
    'while (true) { if (a) continue }',
    'outer: while (true) { if (a) continue outer }',
    'while (true) { if (a) f() }',
    'while (x) { if (a) break }',
    "while ('') { if (a) break }",
    'for (; x;) { if (a) break }',
    'do { if (a) break } while (0)',
    'while (true) { switch (x) { case 1: if (a) break } }',
    'while (true) { for (x of y) { if (a) break } }',
    'while (true) { for (x in y) { if (a) break } }',
    'function f() { while (x) { if (a) return } }',
    'while (true) { x = () => { if (a) return } }',
    'function f() { if (a) return }',
  ])('finds no loop for %s', source => {
    let { find, tree } = createTestFile(source)

    expect(getExitedLoops(tree, find('IfStatement'))).toStrictEqual([])
  })

  it('finds no loop for a return at the top level of a script', () => {
    let { find, tree } = createTestFile('if (a) return', 'example.cjs')

    expect(getExitedLoops(tree, find('IfStatement'))).toStrictEqual([])
  })

  it('throws for a node outside the runtime tree', () => {
    let source = 'while (true) { if (a) break }'
    let { tree } = createTestFile(source)
    let other = createTestFile(source)

    expect(() => getExitedLoops(tree, other.find('IfStatement'))).toThrow(
      'Node is not part of the runtime tree of the file.',
    )
  })
})
