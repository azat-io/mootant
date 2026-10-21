import { describe, expect, it, vi } from 'vitest'

import type { AnalyzedProgram } from '../../../types/syntax/analyzed-program'
import type { Binding } from '../../../types/syntax/binding'

import { getClosedInitializer } from '../../../core/syntax/get-closed-initializer'
import { createTestFile } from '../../helpers/create-test-file'

/**
 * Snippet with the program a question about its name `n` reads.
 */
interface NamedSnippet {
  /**
   * Runtime tree, scope analysis and shared scopes of the snippet.
   */
  program: AnalyzedProgram

  /**
   * Binding of the name `n`.
   */
  binding: Binding
}

/**
 * Parses a snippet that declares the name `n`.
 *
 * @param source - Snippet that declares `n`.
 * @param component - Whether the snippet is the script of a component, whose
 *   top level other code shares; false when omitted.
 * @returns The program of the snippet and the binding of `n`.
 */
function parse(source: string, component = false): NamedSnippet {
  let file = createTestFile(source)
  return {
    binding: [...file.scopes.bindings.values()].find(
      binding =>
        binding.identifier.type === 'Identifier' &&
        binding.identifier.name === 'n',
    )!,
    program: {
      shared: new Set(component ? [file.parsed.program] : []),
      scopes: file.scopes,
      tree: file.tree,
    },
  }
}

/**
 * Finds the initializer of the name `n` of a snippet with a check that allows
 * every read.
 *
 * @param source - Snippet that declares `n`.
 * @param component - Whether the snippet is the script of a component; false
 *   when omitted.
 * @returns Source text of the initializer, or null.
 */
function readInitializer(source: string, component = false): string | null {
  let { binding, program } = parse(source, component)
  let initializer = getClosedInitializer(program, binding, () => true)
  return initializer ? source.slice(initializer.start, initializer.end) : null
}

describe('getClosedInitializer', () => {
  it.each([
    { source: 'const n = s.length; f(n); g(n)', expected: 's.length' },
    { source: 'function h() { let n = [1]; f(n) }', expected: '[1]' },
    { source: 'const n = 1', expected: '1' },
  ])('finds $expected in $source', ({ expected, source }) => {
    expect(readInitializer(source)).toBe(expected)
  })

  it.each([
    'let n = s.length; n++; f(n)',
    'const { n } = s; f(n)',
    'var n = s.length; f(n)',
    'export const n = s.length; f(n)',
    'const n = s.length; eval(code); f(n)',
    'const n = s.length; export { n }',
  ])('finds none in %s', source => {
    expect(readInitializer(source)).toBeNull()
  })

  it('finds none for a const of a component', () => {
    expect(readInitializer('const n = 1; f(n)', true)).toBeNull()
  })

  it('finds none when a read fails the check', () => {
    let { binding, program } = parse('const n = s.length; f(n); g(n)')
    let [first, second] = binding.references

    expect(
      getClosedInitializer(
        program,
        binding,
        (_, reference) => reference !== second,
      ),
    ).toBeNull()
    expect(
      getClosedInitializer(
        program,
        binding,
        (_, reference) => reference === first || reference === second,
      ),
    ).not.toBeNull()
  })

  it('walks the reads of a name once for each check', () => {
    let { binding, program } = parse('const n = s.length; f(n); g(n); h(n)')
    let check = vi.fn(() => true)
    let other = vi.fn(() => false)

    for (let index = 0; index < 5; index++) {
      expect(getClosedInitializer(program, binding, check)).not.toBeNull()
      expect(getClosedInitializer(program, binding, other)).toBeNull()
    }
    expect(check).toHaveBeenCalledTimes(3)
    expect(other).toHaveBeenCalledExactlyOnceWith(
      program.tree,
      binding.references[0],
    )
  })

  it('checks the closure of a name for each set of shared scopes', () => {
    let { binding, program } = parse('let n = s.length; f(n)')
    let check = vi.fn(() => true)

    expect(getClosedInitializer(program, binding, check)).not.toBeNull()
    expect(
      getClosedInitializer(
        { ...program, shared: new Set([binding.scope]) },
        binding,
        check,
      ),
    ).toBeNull()
    expect(getClosedInitializer(program, binding, check)).not.toBeNull()
    expect(check).toHaveBeenCalledExactlyOnceWith(
      program.tree,
      binding.references[0],
    )
  })
})
