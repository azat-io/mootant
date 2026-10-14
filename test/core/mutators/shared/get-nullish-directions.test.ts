import { describe, expect, it } from 'vitest'

import type { TestContextSetup } from '../../../helpers/create-test-context'

import { getNullishDirections } from '../../../../core/mutators/shared/get-nullish-directions'
import { createRunContext } from '../../../../core/mutators/shared/create-run-context'
import { createTestContext } from '../../../helpers/create-test-context'

describe('getNullishDirections', () => {
  it.each<[string, boolean[], TestContextSetup]>([
    ['function f(e: boolean | undefined) { if (e ?? false) {} }', [true], {}],
    ['function f(e: boolean | undefined) { if (e ?? true) {} }', [false], {}],
    ['function f(e: number | undefined) { if (e ?? 0) {} }', [true], {}],
    ['function f(e: number | undefined) { if (e ?? 1) {} }', [false], {}],
    ['if (e ?? y) {}', [false], {}],
    [
      'function f(e: string | undefined, y: string) { if (e ?? y) {} }',
      [false, true],
      {},
    ],
    [
      'function f(e: string | undefined, y: string) { if (e ?? y) {} }',
      [],
      { disabled: ['logical-operator'] },
    ],
    [
      'function f(e: boolean | undefined) { if (e ?? false) {} }',
      [],
      { disabled: ['boolean-literal'] },
    ],
    ["function f(e: string | undefined) { x = e ?? '' }", [], {}],
    ["function f(e: string | undefined) { throw new Error(e ?? '') }", [], {}],
  ])('finds the directions of %s', (source, expected, setup) => {
    let { context, find } = createTestContext(source, setup)
    let group = find('LogicalExpression')

    expect(
      getNullishDirections(
        group,
        { mutator: 'condition', node: group },
        createRunContext(context),
      ),
    ).toEqual(expected)
  })

  it.each<[string, string, boolean[]]>([
    [
      'function f(e: string | undefined, y: string) { if (a && (e ?? y)) {} }',
      'e ?? y',
      [false, true],
    ],
    [
      "function f(e: number | undefined, c: string) { x = (e ?? '') && c }",
      "e ?? ''",
      [],
    ],
  ])('finds the directions of %s at %s', (source, text, expected) => {
    let { context, find } = createTestContext(source)
    let group = find('LogicalExpression', text)

    expect(
      getNullishDirections(
        group,
        { mutator: 'condition', node: group },
        createRunContext(context),
      ),
    ).toEqual(expected)
  })
})
