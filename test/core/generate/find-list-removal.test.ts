import { describe, expect, it } from 'vitest'

import { findListRemoval } from '../../../core/generate/find-list-removal'
import { createTestFile } from '../../helpers/create-test-file'

describe('findListRemoval', () => {
  it('reads the removal of an array element', () => {
    let { find, tree } = createTestFile('x = [a, b]')
    let list = find('ArrayExpression')

    expect(
      findListRemoval(tree, { node: find('Identifier', 'b'), text: '' }, false),
    ).toStrictEqual({
      kind: 'element',
      narrow: true,
      copies: 0,
      index: 1,
      list,
    })
  })

  it('replaces the whole array for every element of an array with a hole', () => {
    let { find, tree } = createTestFile('x = [a, , b, c]')
    let list = find('ArrayExpression')

    expect(
      findListRemoval(tree, { node: find('Identifier', 'b'), text: '' }, false),
    ).toStrictEqual({
      kind: 'element',
      narrow: false,
      copies: 3,
      index: 2,
      list,
    })
  })

  it.each([
    { source: 'x = { a, b: 1 }', member: 'b: 1', narrow: true, copies: 0 },
    {
      source: 'x = { a, get b() { return 1 }, set b(v) {} }',
      member: 'get b() { return 1 }',
      narrow: false,
      copies: 2,
    },
    {
      source: 'x = { a, b: 1, get c() { return 1 } }',
      member: 'b: 1',
      narrow: true,
      copies: 1,
    },
  ])(
    'reads the removal of $member from an object literal',
    ({ source, member, narrow, copies }) => {
      let { find, tree } = createTestFile(source)
      let list = find('ObjectExpression')

      expect(
        findListRemoval(
          tree,
          { node: find('Property', member), text: '' },
          false,
        ),
      ).toStrictEqual({ kind: 'property', index: 1, narrow, copies, list })
    },
  )

  it('replaces the whole literal for every removal in a Svelte template', () => {
    let { find, tree } = createTestFile('x = [a, b]')
    let list = find('ArrayExpression')

    expect(
      findListRemoval(tree, { node: find('Identifier', 'b'), text: '' }, true),
    ).toStrictEqual({
      kind: 'element',
      narrow: false,
      copies: 2,
      index: 1,
      list,
    })
  })

  it('reads each literal once for all its removals', () => {
    let { find, tree } = createTestFile('x = { get a() { return 1 }, b: 2 }')
    let first = findListRemoval(
      tree,
      {
        node: find('Property', 'get a() { return 1 }'),
        text: '',
      },
      false,
    )
    let second = findListRemoval(
      tree,
      {
        node: find('Property', 'b: 2'),
        text: '',
      },
      false,
    )

    expect([first?.narrow, first?.copies]).toStrictEqual([false, 1])
    expect([second?.narrow, second?.copies]).toStrictEqual([true, 1])
  })

  it.each([
    { source: 'x = [a, b]', node: 'b', text: 'c' },
    { source: 'f(a, b)', node: 'b', text: '' },
    { source: 'x = a + b', node: 'b', text: '' },
  ])(
    'finds no removal for $text in place of $node in $source',
    ({ source, node, text }) => {
      let { find, tree } = createTestFile(source)

      expect(
        findListRemoval(tree, { node: find('Identifier', node), text }, false),
      ).toBeNull()
    },
  )

  it('finds no removal for a node outside the runtime tree', () => {
    let { tree } = createTestFile('x = [a, b]')
    let other = createTestFile('x = [a, b]')

    expect(
      findListRemoval(
        tree,
        { node: other.find('Identifier', 'b'), text: '' },
        false,
      ),
    ).toBeNull()
  })
})
