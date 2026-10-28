import type { Node } from 'oxc-parser'

import { describe, expect, it, vi } from 'vitest'

import { getNamedGroupsFact } from '../../../core/syntax/get-named-groups-fact'
import { createTestProgram } from '../../helpers/create-test-program'
import { createTestFile } from '../../helpers/create-test-file'

/**
 * Finds why a member of a snippet, the object or callee that an optional link
 * guards, is never nullish there.
 *
 * @param source - Snippet with the member.
 * @param receiver - Text of the member: a member expression, or parentheses or
 *   a non-null assertion around one.
 * @param component - Whether the snippet is the script of a component, whose
 *   top level other code shares; false when omitted.
 * @returns The reason, or null.
 */
function explain(
  source: string,
  receiver: string,
  component = false,
): string | null {
  let file = createTestFile(source)
  let type: Node['type'] = 'MemberExpression'
  if (receiver.startsWith('(')) {
    type = 'ParenthesizedExpression'
  } else if (receiver.endsWith('!')) {
    type = 'TSNonNullExpression'
  }
  return getNamedGroupsFact(
    createTestProgram(file, component),
    file.find(type, receiver),
  )
}

/**
 * Reason of the groups of a match of a regex with a named group.
 */
const GROUPS =
  'the regex has a named group, so groups is an object whenever the match is'

/**
 * Reason of a named group that takes part in every match.
 *
 * @param name - Name of the group.
 * @returns The reason that names the group.
 */
function named(name: string): string {
  return `the named group \`${name}\` takes part in every match, so its value is a string`
}

describe('getNamedGroupsFact', () => {
  it.each([
    {
      source: 'x = /(?<a>x)/u.exec(s)?.groups?.a',
      receiver: '/(?<a>x)/u.exec(s)?.groups',
      expected: GROUPS,
    },
    {
      source: 'const re = /(?<a>x)/gu; x = re.exec(s)?.groups?.a',
      receiver: 're.exec(s)?.groups',
      expected: GROUPS,
    },
    {
      source: 'let re = /(?<a>x)/u; x = re.exec(s)!.groups?.a',
      receiver: 're.exec(s)!.groups',
      expected: GROUPS,
    },
    {
      source: 'const re = /(?<a>x)/u; const m = re.exec(s); x = m?.groups?.a',
      receiver: 'm?.groups',
      expected: GROUPS,
    },
    {
      source:
        "let m = text.match(/(?<key>[^:]+):/u); x = m?.groups?.['key']?.trim()",
      receiver: 'm?.groups',
      expected: GROUPS,
    },
    {
      source:
        "let m = text.match(/(?<key>[^:]+):/u); x = m?.groups?.['key']?.trim()",
      receiver: "m?.groups?.['key']",
      expected: named('key'),
    },
    {
      source: 'const m = s?.match(/(?<a>x)/u); x = m?.groups.a?.length',
      receiver: 'm?.groups.a',
      expected: named('a'),
    },
    {
      source: "const m = (/(?<a>x)/u.exec(s)); x = m.groups[('a')]?.length",
      receiver: "m.groups[('a')]",
      expected: named('a'),
    },
    {
      source:
        'const m = /(?<a>x)/u.exec(s); x = (m.groups as Record<string, string>)?.a',
      receiver: '(m.groups as Record<string, string>)',
      expected: GROUPS,
    },
    {
      source: 'const m = /(?<a>x)/u.exec(s); x = m.groups!?.a',
      receiver: 'm.groups!',
      expected: GROUPS,
    },
    {
      source:
        "let match = /(?:x(?<tail>y))?z/u.exec(text); x = match?.groups?.['tail']?.trim()",
      receiver: 'match?.groups',
      expected: GROUPS,
    },
    {
      source: 'x = /(?<groups>x)/u.exec(s).groups.groups?.length',
      receiver: '/(?<groups>x)/u.exec(s).groups.groups',
      expected: named('groups'),
    },
    {
      source:
        'const m = /(?<a>x)/u.exec(s); if (!m) throw e; if (m.groups && ok) use(m.groups.a); x = m?.groups?.a',
      receiver: 'm?.groups',
      expected: GROUPS,
    },
    {
      source:
        "const m = /(?<a>x)/u.exec(s); if (m?.groups) use({ a: m.groups['a'] }); x = m!.groups!.a?.length",
      receiver: 'm!.groups!.a',
      expected: named('a'),
    },
    {
      source:
        "const re = /(?<a>x)/u; s.split(re); if (re.test(s)) x = re.exec(s)?.groups?.['a']",
      receiver: 're.exec(s)?.groups',
      expected: GROUPS,
    },
    {
      source: 'eval(code); x = /(?<a>x)/u.exec(s)?.groups?.a',
      receiver: '/(?<a>x)/u.exec(s)?.groups',
      expected: GROUPS,
    },
  ])('explains $receiver in $source', ({ receiver, expected, source }) => {
    expect(explain(source, receiver)).toBe(expected)
  })

  it.each([
    {
      source:
        "let match = /(?:x(?<tail>y))?z/u.exec(text); x = match?.groups?.['tail']?.trim()",
      receiver: "match?.groups?.['tail']",
    },
    {
      source: 'x = /(?<a>x)(?<b>y)?/u.exec(s)?.groups?.b?.length',
      receiver: '/(?<a>x)(?<b>y)?/u.exec(s)?.groups?.b',
    },
    {
      source: String.raw`x = s.match(/(?<word>\w+)/gu)?.groups?.['word']`,
      receiver: String.raw`s.match(/(?<word>\w+)/gu)?.groups`,
    },
    {
      source: 'const re = /(?<a>x)/gu; x = s.match(re)?.groups?.a',
      receiver: 's.match(re)?.groups',
    },
    {
      source: 'x = /(x)/u.exec(s)?.groups?.a',
      receiver: '/(x)/u.exec(s)?.groups',
    },
    {
      source: 'x = /(?<a>x)/u.exec(s)?.groups?.b?.length',
      receiver: '/(?<a>x)/u.exec(s)?.groups?.b',
    },
    {
      source: 'x = /(?<a>x)/u.exec(s)?.groups?.[name]?.length',
      receiver: '/(?<a>x)/u.exec(s)?.groups?.[name]',
    },
    {
      source: 'x = /(?<a>x)/u.exec(s)?.[0]?.length',
      receiver: '/(?<a>x)/u.exec(s)?.[0]',
    },
    {
      source: "const m = /(?<a>x)/u.exec(s); x = m?.['groups']?.a",
      receiver: "m?.['groups']",
    },
    {
      source: 'const m = /(?<a>x)/u.exec(s); x = (m?.groups)?.a',
      receiver: '(m?.groups)',
    },
    {
      source: 'function g(m: RegExpExecArray) { return m?.groups?.a }',
      receiver: 'm?.groups',
    },
    {
      source: 'let m = /(?<a>x)/u.exec(s); m = null; x = m?.groups?.a',
      receiver: 'm?.groups',
    },
    {
      source: 'var m = /(?<a>x)/u.exec(s); x = m?.groups?.a',
      receiver: 'm?.groups',
    },
    {
      source:
        'const re = /(?<a>x)/gu; let m; while ((m = re.exec(s)) !== null) x = m.groups?.a',
      receiver: 'm.groups',
    },
    {
      source: 'const m = /(?<a>x)/u.exec(s); eval(code); x = m?.groups?.a',
      receiver: 'm?.groups',
    },
    {
      source: 'function g(re: RegExp) { return re.exec(s)?.groups?.a }',
      receiver: 're.exec(s)?.groups',
    },
    {
      source: 'const m = s.match(/(?<a>x)/u, 1); x = m?.groups?.a',
      receiver: 'm?.groups',
    },
    {
      source: 'const m = s.matchAll(/(?<a>x)/gu); x = m?.groups?.a',
      receiver: 'm?.groups',
    },
    {
      source: 'const m = /(?<a>x)/u; x = m?.groups?.a',
      receiver: 'm?.groups',
    },
    {
      source: 'x = obj.groups?.a',
      receiver: 'obj.groups',
    },
    {
      source: 'x = this.match?.groups?.a',
      receiver: 'this.match?.groups',
    },
    {
      source:
        "class A { #key = ''; g(s: string) { return /(?<key>x)/u.exec(s)!.groups.#key?.trim() } }",
      receiver: '/(?<key>x)/u.exec(s)!.groups.#key',
    },
    {
      source: 'export const m = /(?<a>x)/u.exec(s); x = m?.groups?.a',
      receiver: 'm?.groups',
    },
    {
      source: 'const m = /(?<a>x)/u.exec(s); x = m?.groups?.a; export { m }',
      receiver: 'm?.groups',
    },
    {
      source:
        'const m = /(?<a>x)/u.exec(s); if (m && clear) m.groups = undefined; x = m?.groups?.a',
      receiver: 'm?.groups',
    },
    {
      source: 'const m = /(?<a>x)/u.exec(s); strip(m); x = m?.groups?.a',
      receiver: 'm?.groups',
    },
    {
      source:
        'const m = /(?<a>x)/u.exec(s); delete m?.groups; x = m?.groups?.a',
      receiver: 'm?.groups',
    },
    {
      source:
        'const m = /(?<a>x)/u.exec(s); let groups = m?.groups; x = m?.groups?.a',
      receiver: 'm?.groups',
    },
    {
      source:
        'const m = /(?<a>x)/u.exec(s); const all = m || []; x = m?.groups?.a',
      receiver: 'm?.groups',
    },
    {
      source: 'const m = /(?<a>x)/u.exec(s); m?.forEach(g); x = m?.groups?.a',
      receiver: 'm?.groups',
    },
    {
      source: "const m = /(?<a>x)/u.exec(s); m['groups']; x = m?.groups?.a",
      receiver: 'm?.groups',
    },
    {
      source:
        'const m = /(?<a>x)/u.exec(s); if (m?.groups) delete m.groups.a; x = m?.groups!.a?.length',
      receiver: 'm?.groups!.a',
    },
    {
      source:
        'const m = /(?<a>x)/u.exec(s); delete m?.groups?.a; x = m?.groups.a?.length',
      receiver: 'm?.groups.a',
    },
    {
      source:
        "const m = /(?<a>x)/u.exec(s); m!.groups.a = ''; x = m?.groups.a?.length",
      receiver: 'm?.groups.a',
    },
    {
      source:
        "const m = /(?<a>x)/u.exec(s); m!.groups.a ??= ''; x = m?.groups.a?.length",
      receiver: 'm?.groups.a',
    },
    {
      source:
        'const m = /(?<a>x)/u.exec(s); ({ a: m!.groups.a } = o); x = m?.groups.a?.length',
      receiver: 'm?.groups.a',
    },
    {
      source:
        'const m = /(?<a>x)/u.exec(s); [m!.groups.a = b] = list; x = m?.groups.a?.length',
      receiver: 'm?.groups.a',
    },
    {
      source:
        'const m = /(?<a>x)/u.exec(s); [...m!.groups.a] = list; x = m?.groups.a?.length',
      receiver: 'm?.groups.a',
    },
    {
      source:
        'const m = /(?<a>x)/u.exec(s); for (m!.groups.a of list) {} x = m?.groups.a?.length',
      receiver: 'm?.groups.a',
    },
    {
      source:
        'const m = /(?<a>x)/u.exec(s); m!.groups.a++; x = m?.groups.a?.length',
      receiver: 'm?.groups.a',
    },
    {
      source:
        "const re = /(?<a>x)/u; re.compile('y'); x = re.exec(s)?.groups?.a",
      receiver: 're.exec(s)?.groups',
    },
  ])('explains nothing for $receiver in $source', ({ receiver, source }) => {
    expect(explain(source, receiver)).toBeNull()
  })

  it('explains nothing for a receiver that is not a member', () => {
    let file = createTestFile('const m = /(?<a>x)/u.exec(s); x = m?.()')
    expect(
      getNamedGroupsFact(
        createTestProgram(file),
        file.find('Identifier', 'm', 1),
      ),
    ).toBeNull()
  })

  it('follows a function local of a component and not its top level', () => {
    expect(
      explain(
        'function g() { const m = s.match(/(?<a>x)/u); return m?.groups?.a }',
        'm?.groups',
        true,
      ),
    ).toBe(GROUPS)
    expect(
      explain(
        'const m = s.match(/(?<a>x)/u); x = m?.groups?.a',
        'm?.groups',
        true,
      ),
    ).toBeNull()
    expect(
      explain(
        'let m = s.match(/(?<a>x)/u); x = m?.groups?.a',
        'm?.groups',
        true,
      ),
    ).toBeNull()
  })

  it('walks the reads of a name once for all of its links', () => {
    let reads = Array.from(
      { length: 100 },
      (_, index) => `f(m?.groups?.a, ${index})`,
    )
    let file = createTestFile(
      ['const m = /(?<a>x)/u.exec(s)', ...reads].join('\n'),
    )
    let program = createTestProgram(file)
    let links = reads.map((_, index) =>
      file.find('MemberExpression', 'm?.groups', index),
    )
    let lookups = vi.spyOn(file.tree.slots, 'get')

    expect(getNamedGroupsFact(program, links[0]!)).toBe(GROUPS)

    let walk = lookups.mock.calls.length

    expect(walk).toBeGreaterThanOrEqual(reads.length)
    expect(links.map(link => getNamedGroupsFact(program, link))).toStrictEqual(
      reads.map(() => GROUPS),
    )
    expect(lookups).toHaveBeenCalledTimes(walk)
  })
})
