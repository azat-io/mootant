import type { Node } from 'oxc-parser'

import { describe, expect, it } from 'vitest'

import type { TestContextSetup } from '../../../helpers/create-test-context'

import { createRunContext } from '../../../../core/mutators/shared/create-run-context'
import { hasPolarMutant } from '../../../../core/mutators/shared/has-polar-mutant'
import { createTestContext } from '../../../helpers/create-test-context'

describe('hasPolarMutant', () => {
  it.each<{
    setup: TestContextSetup
    type: Node['type']
    expected: boolean
    source: string
    value: boolean
    text: string
  }>([
    {
      source: 'if (a > 0 && b) {}',
      type: 'BinaryExpression',
      expected: true,
      text: 'a > 0',
      value: true,
      setup: {},
    },
    {
      source: 'if (a > 0 && b) {}',
      type: 'BinaryExpression',
      expected: true,
      text: 'a > 0',
      value: false,
      setup: {},
    },
    {
      source: 'if (!(a > 0) && b) {}',
      type: 'UnaryExpression',
      text: '!(a > 0)',
      expected: true,
      value: true,
      setup: {},
    },
    {
      source: "if (a === 'x' && b) {}",
      type: 'BinaryExpression',
      text: "a === 'x'",
      expected: false,
      value: true,
      setup: {},
    },
    {
      source: "x = a === 'x' && b",
      type: 'BinaryExpression',
      text: "a === 'x'",
      expected: true,
      value: false,
      setup: {},
    },
    {
      source:
        'function f(x: boolean | undefined) { if (a && (x ?? false)) {} }',
      type: 'ParenthesizedExpression',
      text: '(x ?? false)',
      expected: true,
      value: true,
      setup: {},
    },
    {
      source:
        'function f(x: boolean | undefined) { if (a && !(x ?? false)) {} }',
      type: 'UnaryExpression',
      text: '!(x ?? false)',
      expected: true,
      value: false,
      setup: {},
    },
    {
      source: 'if ((c || a) && b) {}',
      type: 'LogicalExpression',
      text: '(c || a) && b',
      expected: true,
      value: false,
      setup: {},
    },
    {
      source: 'if ((c || a) && b) {}',
      type: 'LogicalExpression',
      text: '(c || a) && b',
      expected: false,
      value: true,
      setup: {},
    },
    {
      type: 'LogicalExpression',
      source: 'if (c || a) {}',
      expected: false,
      text: 'c || a',
      value: false,
      setup: {},
    },
    {
      source: 'if (!(c || a) && b) {}',
      type: 'UnaryExpression',
      text: '!(c || a)',
      expected: true,
      value: true,
      setup: {},
    },
    {
      source: 'x = (c || a) && b',
      type: 'LogicalExpression',
      text: '(c || a) && b',
      expected: false,
      value: false,
      setup: {},
    },
    {
      source: 'x = (c || d > 1) && b',
      type: 'LogicalExpression',
      text: '(c || d > 1) && b',
      expected: true,
      value: true,
      setup: {},
    },
    {
      setup: { disabled: ['comparison-operator'] },
      source: 'if (a > 0 && b) {}',
      type: 'BinaryExpression',
      expected: false,
      text: 'a > 0',
      value: true,
    },
    {
      source: [
        '// mootant-ignore-next-line comparison-operator',
        'if (a > 0 && b) {}',
      ].join('\n'),
      type: 'BinaryExpression',
      expected: false,
      text: 'a > 0',
      value: true,
      setup: {},
    },
    {
      source: 'if (f(a > 0) && b) {}',
      type: 'CallExpression',
      text: 'f(a > 0)',
      expected: false,
      value: true,
      setup: {},
    },
    {
      source: 'if (c || (a > 0 && b > 0)) {}',
      text: 'c || (a > 0 && b > 0)',
      type: 'LogicalExpression',
      expected: true,
      value: true,
      setup: {},
    },
  ])(
    'walks $source from $type',
    ({ expected, source, value, setup, type, text }) => {
      let { context, find } = createTestContext(source, setup)
      let decision = find(type, text)
      let group = find('LogicalExpression', undefined, 0)

      expect(
        hasPolarMutant(
          {
            candidate: { mutator: 'logical-operator', node: group },
            decision,
            value,
          },
          createRunContext(context),
        ),
      ).toBe(expected)
    },
  )

  it('includes the decision itself on request', () => {
    let { context, find } = createTestContext('if ((c || a) && b) {}')
    let decision = find('LogicalExpression', 'c || a')
    let query = {
      candidate: { mutator: 'logical-operator', node: decision },
      value: false,
      decision,
    }
    let runContext = createRunContext(context)

    expect(hasPolarMutant(query, runContext)).toBe(false)
    expect(hasPolarMutant(query, runContext, true)).toBe(true)
  })
})
