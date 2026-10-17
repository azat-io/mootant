import { describe, expect, it } from 'vitest'

import { readLiteralType } from '../../../core/syntax/read-literal-type'
import { createTestFile } from '../../helpers/create-test-file'

/**
 * Reads the type of the value assigned to `x` in a snippet.
 *
 * @param source - Value of `x`.
 * @returns The type of the literal-only value, or null.
 */
function read(source: string): 'number' | 'string' | null {
  let { find } = createTestFile(`x = ${source}`)
  return readLiteralType(find('AssignmentExpression').right)
}

describe('readLiteralType', () => {
  it.each([
    { source: '1000', type: 'number' },
    { source: '60 * 1000', type: 'number' },
    { source: '(2 ** 10) % 7 - 1 / 3', type: 'number' },
    { source: '-(+1)', type: 'number' },
    { source: "-'100'", type: 'number' },
    { source: "'100' * 2", type: 'number' },
    { source: '1 + 2', type: 'number' },
    { source: "'100'", type: 'string' },
    { type: 'string', source: '``' },
    { source: "'1' + 2", type: 'string' },
    { source: "1 + '2'", type: 'string' },
    { source: '(1000 as number)', type: 'number' },
  ] as const)('reads $source as a $type', ({ source, type }) => {
    expect(read(source)).toBe(type)
  })

  it.each([
    '1n',
    '/a/',
    'true',
    'null',
    // eslint-disable-next-line no-template-curly-in-string
    '`${1}`',
    'base',
    'base * 2',
    '2 * base',
    'options.delay',
    'f()',
    '!1',
    '~1',
    '1 < 2',
    '1 | 2',
    'quick ? 1 : 2',
    '1 || 2',
  ])('rejects %s', source => {
    expect(read(source)).toBeNull()
  })
})
