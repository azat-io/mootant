import { describe, expect, it } from 'vitest'

import { getMutantRegions } from '../../../core/generate/get-mutant-regions'
import { createDigest } from '../../../core/cache/create-digest'
import { createTestFile } from '../../helpers/create-test-file'

/**
 * Finds the regions of mutants that start at the first occurrence of each text
 * of a snippet.
 *
 * @param lines - Lines of the snippet, a TSX file.
 * @param texts - Texts whose first occurrence starts a mutant.
 * @returns Digest of the region of each mutant, in the order of the texts.
 */
function regionsOf(lines: string[], texts: string[]): string[] {
  let source = lines.join('\n')
  let { parsed, scopes, tree } = createTestFile(source, 'example.tsx')
  let mutants = texts.map((text, index) => ({
    start: source.indexOf(text),
    id: `m${index}`,
  }))
  let regions = getMutantRegions({
    program: { program: parsed.program, scopes, tree },
    mutants,
    source,
  })
  return mutants.map(mutant => regions.get(mutant.id)!)
}

describe('getMutantRegions', () => {
  it('keeps the region of a mutant when code outside it moves or changes', () => {
    let lines = [
      'function add(a: number, b: number) { return a + b }',
      'function sub(a: number, b: number) { return a - b }',
      'function mul(a: number, b: number) { return a * b }',
    ]
    let [add, sub, mul] = regionsOf(lines, ['a + b', 'a - b', 'a * b'])
    let edited = regionsOf(
      [
        'const unused = 1',
        lines[0]!,
        '// a comment between statements',
        'function sub(a: number, b: number) { return b - a }',
        lines[2]!,
      ],
      ['a + b', 'b - a', 'a * b'],
    )

    expect(new Set([add, sub, mul])).toHaveProperty('size', 3)
    expect(edited[0]).toBe(add)
    expect(edited[1]).not.toBe(sub)
    expect(edited[2]).toBe(mul)
  })

  it('gives mutants of one statement one region that any change of it changes', () => {
    let [first, second] = regionsOf(
      ['function f(a: number) {', '  let b = a + 1', '  return b * 2', '}'],
      ['a + 1', 'b * 2'],
    )
    let [changed] = regionsOf(
      ['function f(a: number) {', '  let b = a + 1', '  return b * 3', '}'],
      ['a + 1'],
    )

    expect(second).toBe(first)
    expect(changed).not.toBe(first)
  })

  it('takes in the statements a statement uses by name, also through others', () => {
    /**
     * Finds the regions of the mutants of `check` and `other` with some texts
     * of the file.
     *
     * @param texts - Texts that differ from the defaults.
     * @param texts.limit - Initializer of `LIMIT`; `5` by default.
     * @param texts.spare - Initializer of `SPARE`; `1` by default.
     * @param texts.parse - Import source of `parse`; `./parse` by default.
     * @param texts.unused - Import source of `unused`; `./unused` by default.
     * @returns Regions of the two mutants.
     */
    function regionsWith(texts: {
      unused?: string
      parse?: string
      limit?: string
      spare?: string
    }): string[] {
      let {
        unused = './unused',
        parse = './parse',
        limit = '5',
        spare = '1',
      } = texts
      return regionsOf(
        [
          `import { parse } from '${parse}'`,
          `import { unused } from '${unused}'`,
          `const LIMIT = ${limit}`,
          `const SPARE = ${spare}`,
          'let count = 0',
          'function helper(x: number) { count++; return x > LIMIT }',
          'export function check(x: string) { return helper(parse(x)) && x !== "" }',
          'export function other(x: number) { return x < LIMIT }',
        ],
        ['x !== ""', 'x < LIMIT'],
      )
    }
    let [check, other] = regionsWith({})
    let limit = regionsWith({ limit: '6' })
    let parse = regionsWith({ parse: './read' })

    expect(regionsWith({ unused: './spare', spare: '2' })).toStrictEqual([
      check,
      other,
    ])
    expect(limit[0]).not.toBe(check)
    expect(limit[1]).not.toBe(other)
    expect(parse[0]).not.toBe(check)
    expect(parse[1]).toBe(other)
  })

  it('takes in every declaration of a name, such as the implementation of overloads', () => {
    /**
     * Finds the region of the mutant of `read` with a body of `parse`.
     *
     * @param body - Body of the implementation of `parse`.
     * @returns Region of the mutant.
     */
    function regionWith(body: string): string {
      return regionsOf(
        [
          'export function parse(text: string): number',
          'export function parse(text: number): number',
          `export function parse(text: string | number): number { ${body} }`,
          'export function read(text: string) { return parse(text) > 0 }',
        ],
        ['parse(text) > 0'],
      )[0]!
    }

    expect(regionWith('return Number(text)')).not.toBe(
      regionWith('return Number(text) + 1'),
    )
  })

  it('takes in a counter that a statement writes', () => {
    let [bump] = regionsOf(
      ['let count = 0', 'export function bump() { count++; return count > 1 }'],
      ['count > 1'],
    )
    let [changed] = regionsOf(
      ['let count = 1', 'export function bump() { count++; return count > 1 }'],
      ['count > 1'],
    )

    expect(changed).not.toBe(bump)
  })

  it('takes in the statements that write a name a statement reads', () => {
    /**
     * Finds the region of the mutant of `positive` after an assignment.
     *
     * @param assignment - Top-level assignment of `value`.
     * @returns Region of the mutant.
     */
    function regionWith(assignment: string): string {
      return regionsOf(
        [
          'let value = 0',
          assignment,
          'export function positive() { return value > 0 }',
        ],
        ['value > 0'],
      )[0]!
    }

    expect(regionWith('value = -1')).not.toBe(regionWith('value = 1'))
  })

  it('follows names that call each other in a cycle', () => {
    /**
     * Finds the region of the mutant of `isEven` with a body of `isOdd`.
     *
     * @param odd - Body of `isOdd`.
     * @returns Region of the mutant.
     */
    function regionWith(odd: string): string {
      return regionsOf(
        [
          'function isEven(n: number): boolean { return n === 0 || isOdd(n - 1) }',
          `function isOdd(n: number): boolean { ${odd} }`,
        ],
        ['n === 0'],
      )[0]!
    }

    expect(regionWith('return n !== 0 && isEven(n - 1)')).not.toBe(
      regionWith('return n !== 1 && isEven(n - 1)'),
    )
  })

  it('takes in the components a statement renders as JSX elements', () => {
    /**
     * Finds the region of the mutant of `App` with texts of its components.
     *
     * @param header - Text of the `Header` heading.
     * @param item - Text of `Menu.Item`.
     * @param unused - Text of the component nothing renders.
     * @returns Region of the mutant.
     */
    function regionWith(header: string, item: string, unused: string): string {
      return regionsOf(
        [
          `function Header() { return <h1>${header}</h1> }`,
          `const Menu = { Item: () => <li>${item}</li> }`,
          `function Unused() { return <p>${unused}</p> }`,
          'export function App(props: { open: boolean }) {',
          '  return <main><Header /><Menu.Item /><svg:rect />{props.open && "open"}</main>',
          '}',
        ],
        ['props.open && "open"'],
      )[0]!
    }
    let region = regionWith('Title', 'Home', 'Spare')

    expect(regionWith('Title', 'Home', 'Other')).toBe(region)
    expect(regionWith('Heading', 'Home', 'Spare')).not.toBe(region)
    expect(regionWith('Title', 'Start', 'Spare')).not.toBe(region)
  })

  it('gives every mutant the whole text as its region in a component or an opaque program', () => {
    let lines = [
      'function f(a: number) { return a + 1 }',
      'function g(code: string) { return eval(code) }',
    ]
    let source = lines.join('\n')
    let mutants = [
      { start: source.indexOf('a + 1'), id: 'a' },
      { start: source.indexOf('eval'), id: 'b' },
    ]
    let { parsed, scopes, tree } = createTestFile(source, 'example.ts')
    let opaque = getMutantRegions({
      program: { program: parsed.program, scopes, tree },
      mutants,
      source,
    })
    let component = getMutantRegions({ program: null, mutants, source })
    let edited = getMutantRegions({
      source: source.replace('code)', 'text)'),
      program: null,
      mutants,
    })

    expect(opaque.get('a')).toBe(opaque.get('b'))
    expect(component).toStrictEqual(opaque)
    expect(edited.get('a')).not.toBe(component.get('a'))
  })

  it.each([
    {
      lines: [
        'let count = 0',
        ...Array.from(
          { length: 400 },
          (_, index) =>
            `export function f${index}() { count++; return count > ${index} }`,
        ),
      ],
      title: 'many statements write one name',
    },
    {
      lines: [
        'const a0 = s.length',
        ...Array.from(
          { length: 600 },
          (_, index) => `const a${index + 1} = a${index} + 1`,
        ),
      ],
      title: 'every statement follows a long chain of names',
    },
  ])(
    'gives every mutant the whole text as its region when $title',
    ({ lines }) => {
      let source = lines.join('\n')
      let { parsed, scopes, tree } = createTestFile(source, 'example.ts')
      let regions = getMutantRegions({
        mutants: lines.map((line, index) => ({
          start: source.indexOf(line),
          id: `m${index}`,
        })),
        program: { program: parsed.program, scopes, tree },
        source,
      })

      expect(new Set(regions.values())).toStrictEqual(
        new Set([createDigest([source])]),
      )
    },
  )

  it('gives no regions to a file without mutants', () => {
    expect(
      getMutantRegions({ source: 'let a = 1', program: null, mutants: [] }),
    ).toStrictEqual(new Map())
  })
})
