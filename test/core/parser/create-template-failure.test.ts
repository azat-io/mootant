import { describe, expect, it } from 'vitest'

import { createTemplateFailure } from '../../../core/parser/create-template-failure'

describe('createTemplateFailure', () => {
  it('warns at the problem with the message on one line', () => {
    expect(
      createTemplateFailure(
        { source: 'a\nbc', file: 'a.vue', lang: 'js' },
        { message: 'Bad\n  thing', offset: 3 },
      ),
    ).toStrictEqual({
      diagnostic: {
        message:
          'The template is not mutated, because it does not parse: Bad thing',
        code: 'template-skipped',
        severity: 'warning',
        file: 'a.vue',
        column: 2,
        line: 2,
      },
      kind: 'failed',
    })
  })

  it('warns without a position when the problem has none', () => {
    expect(
      createTemplateFailure(
        { file: 'a.vue', source: 'a', lang: 'js' },
        { message: 'Bad', offset: null },
      ),
    ).toMatchObject({ diagnostic: { column: null, line: null } })
  })
})
