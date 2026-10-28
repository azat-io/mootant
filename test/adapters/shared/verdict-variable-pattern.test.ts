import { describe, expect, it } from 'vitest'

import { VERDICT_VARIABLE_PATTERN } from '../../../adapters/shared/verdict-variable-pattern'

describe('vERDICT_VARIABLE_PATTERN', () => {
  it('matches the variables that change verdicts whether tests read them or not', () => {
    let names = ['*', 'LANG', 'LC_', 'LC_ALL', 'NODE_ENV', 'PATH', 'TZ']

    expect(
      names.filter(name => VERDICT_VARIABLE_PATTERN.test(name)),
    ).toStrictEqual(['LANG', 'LC_ALL', 'NODE_ENV', 'TZ'])
  })
})
