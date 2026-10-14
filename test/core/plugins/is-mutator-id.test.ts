import { describe, expect, it } from 'vitest'

import { isMutatorId } from '../../../core/plugins/is-mutator-id'

describe('isMutatorId', () => {
  it.each(['string-literal', 'acme/no-await', 'a/b', 'plugin2/rule-3'])(
    'accepts %j',
    value => {
      expect(isMutatorId(value)).toBe(true)
    },
  )

  it.each([
    '',
    'StringLiteral',
    'String-literal',
    'acme/',
    '/no-await',
    'acme//no-await',
    'a/b/c',
    'Acme/no-await',
    'acme/no await',
    'string-literal:',
    'a,b',
  ])('rejects %j', value => {
    expect(isMutatorId(value)).toBe(false)
  })
})
