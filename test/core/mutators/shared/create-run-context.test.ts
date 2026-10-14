import { describe, expect, it } from 'vitest'

import { createRunContext } from '../../../../core/mutators/shared/create-run-context'
import { createTestContext } from '../../../helpers/create-test-context'

describe('createRunContext', () => {
  it.each<[string, string[], boolean]>([
    ['if (x > 1) save(x)', [], true],
    [
      [
        '// mootant-ignore-next-line comparison-operator',
        'if (x > 1) save(x)',
      ].join('\n'),
      [],
      false,
    ],
    [
      ['// mootant-ignore-next-line', 'if (x > 1) save(x)'].join('\n'),
      [],
      true,
    ],
    [
      ['// mootant-ignore-next-line', 'if (x > 1) save(x)'].join('\n'),
      ['comparison-operator'],
      false,
    ],
    ['if (x > 1) save(x)', ['comparison-operator'], false],
  ])(
    'judges the comparison for the removal in %s with %j off',
    (source, disabled, expected) => {
      let { context, find } = createTestContext(source, { disabled })
      let runContext = createRunContext(context)

      expect(
        runContext.runs(
          {
            node: find('BinaryExpression'),
            mutator: 'comparison-operator',
          },
          {
            node: find('ExpressionStatement'),
            mutator: 'statement-removal',
          },
        ),
      ).toBe(expected)
    },
  )

  it('keeps the members of the context', () => {
    let { context } = createTestContext('x = 1')
    let runContext = createRunContext(context)

    expect(runContext.sourceCode).toBe(context.sourceCode)
    expect(runContext.settings).toBe(context.settings)
  })
})
