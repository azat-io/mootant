import { describe, expect, it, vi } from 'vitest'

import type { AnalyzedProgram } from '../../../types/syntax/analyzed-program'

import { isGlobalName } from '../../../core/syntax/is-global-name'
import { createTestFile } from '../../helpers/create-test-file'

/**
 * Setup of a snippet whose names are checked.
 */
interface NameSetup {
  /**
   * Whether the snippet is the script of a component, whose top level other
   * code shares; false when omitted.
   */
  component?: boolean

  /**
   * File name, whose extension selects the language; `example.ts` when omitted.
   */
  file?: string
}

/**
 * Tells whether the name `undefined` surely refers to the global anywhere in a
 * snippet.
 *
 * @param source - Snippet to check.
 * @param setup - File name of the snippet and whether it is a component script.
 * @returns Whether `undefined` is the global name.
 */
function check(source: string, setup: NameSetup = {}): boolean {
  let file = createTestFile(source, setup.file)
  let program: AnalyzedProgram = {
    shared: new Set(setup.component ? [file.parsed.program] : []),
    scopes: file.scopes,
    tree: file.tree,
  }
  return isGlobalName(program, 'undefined')
}

describe('isGlobalName', () => {
  it.each([
    'x = []',
    'x = [undefined]',
    'x = { undefined: 1 }.undefined',
    'function f(value = undefined) { let defined = value }',
    'class Box { undefined = 1 }',
  ])('holds in %s', source => {
    expect(check(source)).toBe(true)
  })

  it.each([
    { source: 'function f(undefined) {}', title: 'a parameter' },
    { source: 'function f() { let undefined = 1 }', title: 'a local' },
    {
      source: 'try { g() } catch (undefined) {}',
      title: 'a catch parameter',
    },
    { source: 'function undefined() {}', title: 'a function' },
    { source: 'x = function undefined() {}', title: 'a function name' },
    { source: 'class undefined {}', title: 'a class' },
    {
      source: "import { sep as undefined } from 'node:path'",
      title: 'an import',
    },
    { source: 'let { undefined } = o', title: 'a destructured name' },
  ])('does not hold where $title binds the name', ({ source }) => {
    expect(check(source, { file: 'a.js' })).toBe(false)
  })

  it.each([
    { source: 'with (scope) { x = [] }', file: 'a.js' },
    { source: 'eval(code); x = []', file: 'example.ts' },
  ])(
    'does not hold in $source, where eval or with may bind the name',
    setup => {
      expect(check(setup.source, setup)).toBe(false)
    },
  )

  it.each([
    {
      source: 'namespace NS { export const x = 1 } x = []',
      title: 'a namespace',
    },
    {
      source: 'namespace undefined.Inner { export const x = 1 } x = []',
      title: 'a dotted namespace that starts with the name',
    },
  ])(
    'does not hold beside $title, as TypeScript resolves names across namespace bodies',
    ({ source }) => {
      expect(check(source)).toBe(false)
    },
  )

  it.each([
    {
      source:
        'declare namespace NS { const x: number } declare namespace NS { const y: number } x = []',
      title: 'two ambient bodies of a namespace',
    },
    {
      source: 'declare global { namespace NodeJS { interface Env {} } } x = []',
      title: 'a namespace of a global augmentation',
    },
  ])('holds beside $title', ({ source }) => {
    expect(check(source)).toBe(true)
  })

  it('does not hold in a component, whose other script blocks may bind the name', () => {
    expect(check('x = []', { component: true })).toBe(false)
  })

  it('reads the names of a program once for every question', () => {
    let file = createTestFile('let parts = []; function f(Map) {}')
    let program: AnalyzedProgram = {
      scopes: file.scopes,
      shared: new Set(),
      tree: file.tree,
    }
    let reads = vi.spyOn(file.scopes.bindings, 'values')

    expect(isGlobalName(program, 'undefined')).toBe(true)
    expect(isGlobalName(program, 'Map')).toBe(false)
    expect(isGlobalName(program, 'parts')).toBe(false)
    expect(reads).toHaveBeenCalledExactlyOnceWith()
  })
})
