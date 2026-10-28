import { describe, expect, it, vi } from 'vitest'

import { getCollectionClass } from '../../../core/syntax/get-collection-class'
import { createTestProgram } from '../../helpers/create-test-program'
import { createTestFile } from '../../helpers/create-test-file'
import { findProbe } from '../../helpers/find-probe'

/**
 * Finds the built-in class of the object of the `size` member that the last
 * `f(...)` of a snippet reads.
 *
 * @param source - Snippet that calls `f` with a `size` member.
 * @param component - Whether the snippet is the script of a component, whose
 *   top level other code shares; false when omitted.
 * @param name - File name, whose extension selects the language; `example.ts`
 *   when omitted.
 * @returns `Map` or `Set`, or null.
 * @throws Error - When the argument of `f` is not a member.
 */
function check(
  source: string,
  component = false,
  name = 'example.ts',
): string | null {
  let file = createTestFile(source, name)
  let probe = findProbe(file)
  if (probe.type !== 'MemberExpression') {
    throw new Error('The argument of f is not a member.')
  }
  return getCollectionClass(createTestProgram(file, component), probe.object)
}

describe('getCollectionClass', () => {
  it.each([
    { source: 'f(new Map().size)', expected: 'Map' },
    { source: 'f(new Set(items).size)', expected: 'Set' },
    { source: 'f(new Map<string, number>().size)', expected: 'Map' },
    { source: 'f(new (Set as any)().size)', expected: 'Set' },
    { source: 'f((new Map).size)', expected: 'Map' },
    { source: 'const m = new Map(); f(m.size)', expected: 'Map' },
    {
      source: 'let set = new Set(items); f((set as Set<string>).size)',
      expected: 'Set',
    },
    {
      source: 'function g() { let seen = new Set(); f(seen.size) }',
      expected: 'Set',
    },
    {
      source: [
        'const seen = new Set<string>()',
        'seen.add(a); (seen as Set<string>).add(b); void seen.add(c)',
        'if (seen.has(a)) seen.delete(a)',
        'let removed = seen.delete(b)',
        'x = seen?.size; seen.size = 5',
        'for (const item of seen) use(item)',
        'use([...seen])',
        'seen.clear()',
        'f(seen.size)',
      ].join('\n'),
      expected: 'Set',
    },
    {
      source: [
        'const m = new Map<string, number>()',
        'm.set(k, 1)',
        'use(m.get(k), m.keys(), m.values(), m.entries())',
        'f(m.size)',
      ].join('\n'),
      expected: 'Map',
    },
  ])('finds $expected in $source', ({ expected, source }) => {
    expect(check(source)).toBe(expected)
  })

  it.each([
    'f(Map().size)',
    'f(new WeakMap().size)',
    'f(new Array(3).size)',
    'f(new Map().keys().size)',
    'f(items.size)',
    'f(undeclared.size)',
    'let m = new Map(); m = other; f(m.size)',
    'var m = new Map(); f(m.size)',
    'const { m } = { m: new Map() }; f(m.size)',
    'class Map {} const m = new Map(); f(m.size)',
    'class Set {} f(new Set().size)',
    'const m = new Map(); eval(code); f(m.size)',
    'const m = other; f(m.size)',
  ])('finds no collection in %s', source => {
    expect(check(source)).toBeNull()
  })

  it.each([
    "const unique = new Set(items); Object.defineProperty(unique, 'size', { value: -1 }); f(unique.size)",
    'const unique = new Set(items); Object.setPrototypeOf(unique, { size: -1 }); f(unique.size)',
    "const m = new Map(); Reflect.defineProperty(m, 'size', { get: () => -1 }); f(m.size)",
    'export const pending = new Set<string>(); f(pending.size)',
    'const seen = new Set(); export { seen }; f(seen.size)',
    'function g() { const seen = new Set(); f(seen.size); return seen }',
    'const seen = new Set(); use(seen); f(seen.size)',
    'const seen = new Set(); x = { seen }; f(seen.size)',
    'const seen = new Set(); use(...seen); f(seen.size)',
    'const seen = new Set(); seen.forEach(visit); f(seen.size)',
    'const seen = new Set(); let same = seen.add(a); f(seen.size)',
    'const m = new Map(); m.set(k, 1).set(j, 2); f(m.size)',
    'const seen = new Set(); seen.__proto__ = proto; f(seen.size)',
    'const seen = new Set(); seen.has = () => true; f(seen.size)',
    "const seen = new Set(); seen['add'](a); f(seen.size)",
    'const seen = new Set(); x = seen.add; f(seen.size)',
    'const seen = new Set(); for (const key in seen) use(key); f(seen.size)',
    'const seen = new Set(); use(o[seen]); f(seen.size)',
  ])('finds no collection that other code may reach in %s', source => {
    expect(check(source)).toBeNull()
  })

  it.each([
    'f(new Map().size)',
    'const m = new Map(); f(m.size)',
    'let m = new Map(); f(m.size)',
    'function g() { let seen = new Set(); f(seen.size) }',
  ])(
    'finds no collection in %s in a component, whose other script blocks may declare the class',
    source => {
      expect(check(source, true)).toBeNull()
    },
  )

  it.each([
    { source: 'with (scope) { f(new Map().size) }', file: 'a.js' },
    { source: 'with (scope) { f(new Set(items).size) }', file: 'a.js' },
    { source: 'eval(code); f(new Map().size)', file: 'a.js' },
    { source: 'f(new Set().size); eval(code)', file: 'example.ts' },
  ])(
    'finds no collection in $source, where eval or with may give Map or Set any value',
    ({ source, file }) => {
      expect(check(source, false, file)).toBeNull()
    },
  )

  it('finds no collection in a const that a namespace body reads past an empty namespace', () => {
    let source = [
      'const held = new Map<string, number>()',
      'namespace Inner {',
      '  namespace held {}',
      '  export function hack() {',
      "    Object.defineProperty(held, 'size', { value: -1 })",
      '  }',
      '}',
      'f(held.size)',
    ].join('\n')

    expect(check(source)).toBeNull()
  })

  it('walks the reads of a name once for all of its size members', () => {
    let reads = Array.from(
      { length: 100 },
      (_, index) => `f(seen.size > ${index})`,
    )
    let file = createTestFile(
      ['const seen = new Set(items)', ...reads].join('\n'),
    )
    let program = createTestProgram(file)
    let members = reads.map(
      (_, index) => file.find('MemberExpression', 'seen.size', index).object,
    )
    let lookups = vi.spyOn(file.tree.slots, 'get')

    expect(getCollectionClass(program, members[0]!)).toBe('Set')

    let walk = lookups.mock.calls.length

    expect(walk).toBeGreaterThanOrEqual(reads.length)
    expect(
      members.map(member => getCollectionClass(program, member)),
    ).toStrictEqual(reads.map(() => 'Set'))
    expect(lookups).toHaveBeenCalledTimes(walk)
  })
})
