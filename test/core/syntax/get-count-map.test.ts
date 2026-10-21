import { describe, expect, it } from 'vitest'

import type { AnalyzedProgram } from '../../../types/syntax/analyzed-program'
import type { Binding } from '../../../types/syntax/binding'

import { getCountMap } from '../../../core/syntax/get-count-map'
import { createTestFile } from '../../helpers/create-test-file'

/**
 * Reads the map `m` of a snippet as a count map.
 *
 * @param source - Snippet that declares `m` once.
 * @param component - Whether the snippet is the script of a component, whose
 *   top level other code shares; false when omitted.
 * @returns Source texts of the stored values and names of the value names of
 *   `for...of` loops over it, or null when `m` is not a count map.
 */
function read(
  source: string,
  component = false,
): { entries: string[]; values: string[] } | null {
  let file = createTestFile(source)
  let program: AnalyzedProgram = {
    shared: new Set(component ? [file.parsed.program] : []),
    scopes: file.scopes,
    tree: file.tree,
  }
  let binding = [...file.scopes.bindings.values()].find(
    candidate => getName(candidate) === 'm',
  )!
  let countMap = getCountMap(program, binding)
  return (
    countMap && {
      values: countMap.values.map(value =>
        source.slice(value.start, value.end),
      ),
      entries: countMap.entries.map(getName),
    }
  )
}

/**
 * Reads the name a binding declares.
 *
 * @param binding - Binding of the snippet.
 * @returns The name, or an empty string for a binding without one.
 */
function getName(binding: Binding): string {
  return binding.identifier.type === 'Identifier' ? binding.identifier.name : ''
}

describe('getCountMap', () => {
  it.each([
    {
      expected: { values: ['1'], entries: [] },
      source: 'let m = new Map(); m.set(k, 1)',
    },
    {
      source: [
        'const m = new Map<string, number>()',
        'for (let name of names) m.set(name, (m.get(name) ?? 0) + 1)',
        'for (let [name, count] of m) use(name, count)',
      ].join('\n'),
      expected: { values: ['(m.get(name) ?? 0) + 1'], entries: ['count'] },
    },
    {
      source: [
        'const m = new Map()',
        'm.set(a, 1); m.set(b, 2); (m as Map<string, number>).set(c, 3)',
        'm.get(a); m.has(a); m.delete(a); m.clear(); m!.get(a)',
        'm.keys(); m.values(); m.entries(); m.size; m.size = 5',
        'for (const x of m) use(x)',
        'use([...m])',
      ].join('\n'),
      expected: { values: ['1', '2', '3'], entries: [] },
    },
    {
      source: 'const m = new Map(); m.set(k, 1); for (const [, v] of m) use(v)',
      expected: { entries: ['v'], values: ['1'] },
    },
    {
      source: 'function g() { let m = new Map(); m.set(k, 2); return m.size }',
      expected: { values: ['2'], entries: [] },
    },
  ])('reads $source', ({ expected, source }) => {
    expect(read(source)).toStrictEqual(expected)
  })

  it.each([
    'export const m = new Map(); m.set(k, 1)',
    'let m = new Map(); m.set(k, 1); m = new Map()',
    'var m = new Map(); m.set(k, 1)',
    'const m = new Map([[k, -1]]); m.set(k, 1)',
    'class Map {} const m = new Map(); m.set(k, 1)',
    'const m = new Set(); m.add(1)',
    'const m = new Map(); m.set(k, 1); use(m)',
    'const m = new Map(); m.set(k, 1); m.forEach(f)',
    'const m = new Map(); m.set(k, 1); m.get = () => -1',
    'const m = new Map(); m.set(k, 1); let g = m.get',
    "const m = new Map(); m.set(k, 1); m['set'](k, -1)",
    'const m = new Map(); m.set(k, 1); m.set(k)',
    'const m = new Map(); m.set(k, 1); m.set(k, 1, 2)',
    'const m = new Map(); m.set(k, ...rest)',
    'const m = new Map(); let other = m.set(k, 1)',
    'const m = new Map(); m.set(k, 1).set(j, -1)',
    'const m = new Map(); m.set(k, 1); console.log(m)',
    'const m = new Map(); m.set(k, 1); export { m }',
    'const m = new Map(); m.set(k, 1); use(...m)',
    'const m = new Map(); m.set(k, 1); for (const x in m) use(x)',
    'const m = new Map(); m.get(k)',
    'const m = new Map(); m.set(k, 1); eval(code)',
    'const m = createMap(); m.set(k, 1)',
    'const m = new ns.Map(); m.set(k, 1)',
    'const m = new Map(); m.set(k, 1); use(o[m])',
    'const m = new Map(); m.set(k, 1); use(m.get)',
    'class A { #x = 1; g() { const m = new Map(); m.set(k, 1); return m.#x } }',
  ])('rejects %s', source => {
    expect(read(source)).toBeNull()
  })

  it('rejects a map of a component, whose other script blocks may declare Map', () => {
    expect(read('const m = new Map(); m.set(k, 1)', true)).toBeNull()
    expect(
      read('function g() { const m = new Map(); m.set(k, 1) }', true),
    ).toBeNull()
  })

  it.each([
    'for (var [k, v] of m) use(v)',
    'for (let [k, v] of m) v = 0',
    'for (const [k, v = -1] of m) use(v)',
    'for (const { 1: v } of m) use(v)',
    'for (const entry of m) use(entry)',
    'for (const [k, [v]] of m) use(v)',
    'for (const [k] of m) use(k)',
    'let k, v; for ([k, v] of m) use(v)',
  ])('takes no value name from %s', loop => {
    expect(read(`const m = new Map(); m.set(k, 1); ${loop}`)).toStrictEqual({
      values: ['1'],
      entries: [],
    })
  })
})
