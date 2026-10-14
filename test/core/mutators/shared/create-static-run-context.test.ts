import { describe, expect, it } from 'vitest'

import { createStaticRunContext } from '../../../../core/mutators/shared/create-static-run-context'
import { createTestContext } from '../../../helpers/create-test-context'

describe('createStaticRunContext', () => {
  it('counts every mutant as running', () => {
    let { context, find } = createTestContext(
      ['// mootant-ignore-next-line', 'if (x) notify(x)'].join('\n'),
      { disabled: ['condition'] },
    )
    let runContext = createStaticRunContext(context)
    let test = find('Identifier', 'x')

    expect(
      runContext.runs(
        { mutator: 'condition', node: test },
        { node: find('ExpressionStatement'), mutator: 'statement-removal' },
      ),
    ).toBe(true)
    expect(runContext.hints).toBe(context.hints)
  })
})
