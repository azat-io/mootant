import { describe, expect, it } from 'vitest'

import { createMutantId } from '../../../core/identity/create-mutant-id'

/**
 * Identity of the first test vector.
 */
const BASE = {
  mutator: 'arithmetic-operator',
  replacement: 'a - b',
  path: 'src/math.ts',
  original: 'a + b',
  occurrence: 0,
  scope: 'add',
}

describe('createMutantId', () => {
  it.each([
    // spell-checker: disable-next-line
    ['the base identity', {}, 'rxef04cnhtr7'],
    // spell-checker: disable-next-line
    ['occurrence 1', { occurrence: 1 }, 'k9910akyremp'],
    // spell-checker: disable-next-line
    ['an empty scope', { scope: '' }, '1vwgk50wbfh2'],
    // spell-checker: disable-next-line
    ['the scope sum', { scope: 'sum' }, 'r1stq25p6d72'],
    // spell-checker: disable-next-line
    ['a nested scope', { scope: 'Calculator.add' }, 'h23gnf9xzexv'],
    [
      'line feeds in the texts',
      { replacement: 'a -\n b', original: 'a +\n b' },
      // spell-checker: disable-next-line
      'gyw0g2h844m3',
    ],
    // spell-checker: disable-next-line
    ['a plugin mutator', { mutator: 'acme/no-plus' }, 'mcx5328tes79'],
    // spell-checker: disable-next-line
    ['another path', { path: 'src/lib/math.ts' }, 'wht82w3cajb6'],
    [
      'the research mutator name',
      { mutator: 'ArithmeticOperator' },
      // spell-checker: disable-next-line
      'd24a492ytpkz',
    ],
  ])('reproduces the vector of %s', (_name, changes, id) => {
    expect(createMutantId({ ...BASE, ...changes })).toBe(id)
  })

  it('produces 12 characters without i, l, o and u', () => {
    let ids = Array.from({ length: 200 }, (_, occurrence) =>
      createMutantId({ ...BASE, occurrence }),
    )

    expect(ids.every(id => /^[\da-z]{12}$/u.test(id))).toBe(true)
    expect(ids.some(id => /[il]/u.test(id) || /[ou]/u.test(id))).toBe(false)
    let unique = new Set(ids)

    expect(unique.size).toBe(200)
  })

  it.each([
    ['path', { path: 'src/other.ts' }],
    ['scope', { scope: 'subtract' }],
    ['mutator', { mutator: 'string-literal' }],
    ['original', { original: 'a  + b' }],
    ['replacement', { replacement: 'a * b' }],
    ['occurrence', { occurrence: 2 }],
  ])('changes with the %s', (_name, changes) => {
    expect(createMutantId({ ...BASE, ...changes })).not.toBe(
      createMutantId(BASE),
    )
  })

  it('keeps the parts apart, so moving text between them changes the id', () => {
    expect(
      createMutantId({ ...BASE, replacement: ' b', original: 'a +' }),
    ).not.toBe(createMutantId({ ...BASE, replacement: ' + b', original: 'a' }))
  })
})
