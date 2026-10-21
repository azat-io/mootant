import type { IdentifierReference } from 'oxc-parser'

import { describe, expect, it } from 'vitest'

import type { AnalyzedProgram } from '../../../types/syntax/analyzed-program'

import { isGlobalTypeName } from '../../../core/syntax/is-global-type-name'
import { createTestFile } from '../../helpers/create-test-file'

/**
 * Checks the name of the type reference `Promise<void>` of a snippet.
 *
 * @param source - Snippet with one `Promise<void>` type reference.
 * @param component - Whether the snippet is the script of a component, whose
 *   top level other code shares; false when omitted.
 * @returns Whether the name refers to a type from outside the file.
 */
function check(source: string, component = false): boolean {
  let { parsed, scopes, find, tree } = createTestFile(source)
  let program: AnalyzedProgram = {
    shared: new Set(component ? [parsed.program] : []),
    scopes,
    tree,
  }
  let reference = find('TSTypeReference', 'Promise<void>')
  return isGlobalTypeName(program, reference.typeName as IdentifierReference)
}

describe('isGlobalTypeName', () => {
  it.each([
    'function f(): Promise<void> { return g() }',
    'function g() { type Promise<T> = T[] } function f(): Promise<void> {}',
    "import { all } from 'bluebird'; function f(): Promise<void> {}",
    'const Promise = 1; export { g }; function f(): Promise<void> {}',
    'export const Promise = 1; function f(): Promise<void> {}',
  ])('holds in %s', source => {
    expect(check(source)).toBe(true)
  })

  it.each([
    'type Promise<T> = T[]; function f(): Promise<void> {}',
    'interface Promise<T> { value: T } function f(): Promise<void> {}',
    'class Promise<T> {} function f(): Promise<void> {}',
    'function g<Promise>() {} function f(): Promise<void> {}',
    "import { Promise } from 'bluebird'; function f(): Promise<void> {}",
    "import type { Promise } from 'bluebird'; function f(): Promise<void> {}",
    "import { type Promise } from 'bluebird'; function f(): Promise<void> {}",
    "import Promise from 'bluebird'; function f(): Promise<void> {}",
    "import type Promise = require('bluebird'); function f(): Promise<void> {}",
    'declare namespace N { type P<T> = T } export import Promise = N.P; function f(): Promise<void> {}',
    'namespace N { export let x = 1 } function f(): Promise<void> {}',
  ])('fails in %s', source => {
    expect(check(source)).toBe(false)
  })

  it('fails in the script of a component, whose types other code may declare', () => {
    expect(check('function f(): Promise<void> {}', true)).toBe(false)
  })
})
