import { describe, expect, it } from 'vitest'

import { readNumberLiteral } from '../../../core/syntax/read-number-literal'
import { createTestFile } from '../../helpers/create-test-file'

/**
 * Reads the number literal assigned to `x` in a snippet.
 *
 * @param source - Value of `x`.
 * @returns The number, or null.
 */
function read(source: string): number | null {
  let { find } = createTestFile(`x = ${source}`)
  return readNumberLiteral(find('AssignmentExpression').right)
}

describe('readNumberLiteral', () => {
  it.each([
    { source: '0', expected: 0 },
    { source: '2.5', expected: 2.5 },
    { source: '0x10', expected: 16 },
    { source: '-1', expected: -1 },
    { source: '-(3)', expected: -3 },
    { source: '(4 as number)', expected: 4 },
    { source: '-(5 satisfies number)', expected: -5 },
  ])('reads $source as $expected', ({ expected, source }) => {
    expect(read(source)).toBe(expected)
  })

  it.each([
    '1e400',
    '-1e400',
    '1n',
    "'1'",
    'true',
    'null',
    'n',
    '-n',
    '+1',
    '- -1',
    '1 + 1',
  ])('rejects %s', source => {
    expect(read(source)).toBeNull()
  })
})
