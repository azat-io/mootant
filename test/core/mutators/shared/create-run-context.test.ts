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

  it('never counts a justifier that only changes a log message', () => {
    let { context, find } = createTestContext(
      "function k(a) { let ok = a > 2; console.log('x'); return ok }",
    )
    let runContext = createRunContext(context)
    let returned = {
      node: find('Identifier', 'ok', 1),
      mutator: 'return-value',
    }

    expect(
      runContext.runs(
        { node: find('Literal', "'x'"), mutator: 'string-literal' },
        returned,
      ),
    ).toBe(false)
    expect(
      runContext.runs(
        {
          node: find('ExpressionStatement', "console.log('x');"),
          mutator: 'statement-removal',
        },
        returned,
      ),
    ).toBe(false)
    expect(
      runContext.runs(
        { node: find('BinaryExpression'), mutator: 'comparison-operator' },
        returned,
      ),
    ).toBe(true)
  })

  it('keeps the members of the context', () => {
    let { context } = createTestContext('x = 1')
    let runContext = createRunContext(context)

    expect(runContext.sourceCode).toBe(context.sourceCode)
    expect(runContext.settings).toBe(context.settings)
  })
})
