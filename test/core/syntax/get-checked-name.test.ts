import { describe, expect, it, vi } from 'vitest'

import { getCheckedName } from '../../../core/syntax/get-checked-name'
import { createTestProgram } from '../../helpers/create-test-program'
import { createTestFile } from '../../helpers/create-test-file'

/**
 * Finds the name that the literal `1` of a snippet initializes, with every read
 * allowed or none.
 *
 * @param source - Snippet with such a literal.
 * @param isAllowed - Answer of the check for a read.
 * @param component - Whether the snippet is the script of a component, whose
 *   top level other code shares; false when omitted.
 * @returns The name, or null when the value is used otherwise.
 */
function check(
  source: string,
  isAllowed: boolean,
  component = false,
): string | null {
  let file = createTestFile(source)
  return getCheckedName(
    createTestProgram(file, component),
    file.find('Literal', '1'),
    () => isAllowed,
  )
}

describe('getCheckedName', () => {
  it.each([
    ['let a = 1; f(a)', 'a'],
    ['const a = 1; f(a); g(a)', 'a'],
    ['const a = (1 as number); f(a)', 'a'],
    ['function f() { let a = 1; return a }', 'a'],
  ])('finds the name in %s', (source, expected) => {
    expect(check(source, true)).toBe(expected)
  })

  it.each([
    'let a = 1',
    'let a = 1; a = 2; f(a)',
    'var a = 1; f(a)',
    'let [a] = [1]; f(a)',
    'let { a } = { a: 1 }; f(a)',
    'let { a = 1 } = b; f(a)',
    'x = 1',
    'f(1)',
    'export const a = 1; f(a)',
    'const a = 1; f(a); export { a }',
    'eval(b); let a = 1; f(a)',
  ])('finds no name in %s', source => {
    expect(check(source, true)).toBeNull()
  })

  it('finds no name when a read does not pass the check', () => {
    expect(check('let a = 1; f(a)', false)).toBeNull()
  })

  it('finds no name that the other scripts of a component may read', () => {
    expect(check('let a = 1; f(a)', true, true)).toBeNull()
  })

  it('asks the check about each read with the runtime tree', () => {
    let file = createTestFile('let a = 1; f(a); g(a)')
    let read = vi.fn(() => true)

    getCheckedName(createTestProgram(file), file.find('Literal', '1'), read)

    expect(read).toHaveBeenCalledTimes(2)
    expect(read).toHaveBeenCalledWith(
      file.tree,
      file.find('Identifier', 'a', 1),
    )
  })
})
