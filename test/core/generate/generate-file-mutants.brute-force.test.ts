import { describe, expect, it } from 'vitest'

import type { ExpressionCheck } from '../../helpers/check-expression-mutants'
import type { FormulaDomains } from '../../helpers/get-formula-inputs'
import type { WeakMutants } from '../../helpers/find-weak-mutants'

import { checkExpressionMutants } from '../../helpers/check-expression-mutants'
import { getClassicAlternatives } from '../../helpers/get-classic-alternatives'
import { getFormulaInputs } from '../../helpers/get-formula-inputs'
import { generateFormula } from '../../helpers/generate-formula'
import { printFormula } from '../../helpers/print-formula'
import { createRandom } from '../../helpers/create-random'

/**
 * Value context of the catalog's value brute force (12.3).
 */
interface ValueContext {
  /**
   * Faults of the context around the formula.
   */
  outer(formula: string): string[]

  /**
   * Alternatives that no kept mutant covers, by formula: documented gaps.
   */
  gaps: Record<string, string[]>

  /**
   * Writes the observed expression around a formula.
   */
  wrap(formula: string): string

  /**
   * Text of the snippet before the expression.
   */
  prefix: string

  /**
   * Text of the snippet after the expression.
   */
  suffix: string

  /**
   * File name of the snippet.
   */
  file: string

  /**
   * Seed of the formulas.
   */
  seed: number
}

/**
 * Truth position of the catalog's `??` brute force (12.4).
 */
interface NullishContext {
  /**
   * Writes the condition around an expression, with the other operand and
   * operator of the enclosing group when the position has one.
   */
  wrap(expression: string, operand?: string, operator?: string): string

  /**
   * Operator of the enclosing group with its operands swapped, or null when the
   * position has no group.
   */
  swapped: string | null
}

/**
 * Formula of a brute force case, with what its check needs.
 */
interface FormulaCase {
  /**
   * Classic alternatives of the formula, each written as a whole formula.
   */
  alternatives: string[]

  /**
   * Values of the names, one row per input.
   */
  inputs: unknown[][]

  /**
   * Text of the formula.
   */
  expression: string

  /**
   * Names of the formula, in the order of the input values.
   */
  names: string[]
}

/**
 * How the formulas of a brute force are generated.
 */
interface FormulaSetup {
  /**
   * Values of each kind of name.
   */
  domains: FormulaDomains

  /**
   * Boolean names, of which each formula uses a random prefix.
   */
  booleans: string[]

  /**
   * Whether a comparison may compare two number names instead of a name and the
   * literal 1.
   */
  pairs: boolean
}

/**
 * Language of the `??` brute force, with the types and values of its names.
 */
interface NullishLanguage {
  /**
   * Values of the default name `y`.
   */
  defaults: unknown[]

  /**
   * Values of the left operand `x`.
   */
  values: unknown[]

  /**
   * Text of the snippet before the condition.
   */
  prefix: string

  /**
   * File name of the snippet.
   */
  file: string
}

/**
 * Nothing found: the result of a check that passes.
 */
const NONE: WeakMutants = {
  equivalent: [],
  duplicates: [],
  uncovered: [],
  subsumed: [],
}

/**
 * Parameters of `f` in the TypeScript snippets of the brute force.
 */
const PARAMETERS = [
  'a: boolean',
  'b: boolean',
  'c: boolean',
  'x1: number',
  'x2: number',
  'x3: number',
  'y1: number',
  'y2: number',
  'y3: number',
].join(', ')

/**
 * Values of a number name: below, at and above the literal 1, with room for the
 * shifted literals.
 */
const NUMBERS = [-1, 0, 1, 2, 3]

/**
 * Alternatives that no kept mutant covers in the JavaScript value context, all
 * of the gap catalog 11.8 documents for value-mode logical expressions whose
 * operands have unknown types: each forces an operand of unknown type to a
 * boolean constant, a type-changing value that the drops and the nullish swap
 * avoid.
 */
const UNKNOWN_OPERAND_GAPS: Record<string, string[]> = {
  '(((a && 1 === x1) || b) && (x2 <= 1 || !(1 < x3)))': [
    '(((a && 1 === x1) || false) && (x2 <= 1 || !(1 < x3)))',
  ],
  '((1 <= x1 || a) && b)': ['((1 <= x1 || a) && false)'],
  '((1 < x1 && a) || b)': ['((1 < x1 && a) || false)'],
  '(1 < x1 && (a || b))': ['(1 < x1 && (a || false))'],
  '(a || b)': ['(a || false)'],
  '(a && b)': ['(a && false)'],
}

/**
 * The value contexts of 12.3: `(F) && object` and `(F) || object` with typed
 * operands, and `return F` in plain JavaScript, where every name has an unknown
 * type.
 */
const VALUE_CONTEXTS: Record<string, ValueContext> = {
  '|| object': {
    prefix: [
      'interface Marker { tag: string }',
      'declare function use(value: unknown): void',
      `function f(${PARAMETERS}, marker: Marker, fallback: Marker) {`,
      '  const value = ',
    ].join('\n'),
    outer: formula => [
      `(${formula}) && fallback`,
      'fallback',
      `(${formula})`,
      'true',
    ],
    wrap: formula => `(${formula}) || fallback`,
    suffix: '\n  use(value)\n}\n',
    file: 'example.ts',
    seed: 202,
    gaps: {},
  },
  '&& object': {
    prefix: [
      'interface Marker { tag: string }',
      'declare function use(value: unknown): void',
      `function f(${PARAMETERS}, marker: Marker, fallback: Marker) {`,
      '  const value = ',
    ].join('\n'),
    outer: formula => [
      `(${formula}) || marker`,
      'marker',
      `(${formula})`,
      'false',
    ],
    wrap: formula => `(${formula}) && marker`,
    suffix: '\n  use(value)\n}\n',
    file: 'example.ts',
    seed: 101,
    gaps: {},
  },
  'JavaScript return': {
    prefix: ['export function f(a, b, c, x1, x2, x3) {', '  return '].join(
      '\n',
    ),
    gaps: UNKNOWN_OPERAND_GAPS,
    wrap: formula => formula,
    file: 'example.js',
    outer: () => [],
    suffix: '\n}\n',
    seed: 303,
  },
}

/**
 * Defaults of `x ?? D` in the `??` brute force, with the truthiness flip of
 * each.
 */
const NULLISH_DEFAULTS: Record<string, string> = {
  false: 'true',
  true: 'false',
  null: 'true',
  "'a'": "''",
  "''": "'a'",
  y: '!y',
  0: '1',
  1: '0',
}

/**
 * Truth positions of the `??` brute force.
 */
const NULLISH_CONTEXTS: Record<string, NullishContext> = {
  'right operand of ||': {
    wrap: (expression, operand = 'a', operator = '||') =>
      `${operand} ${operator} (${expression})`,
    swapped: '&&',
  },
  'right operand of &&': {
    wrap: (expression, operand = 'a', operator = '&&') =>
      `${operand} ${operator} (${expression})`,
    swapped: '||',
  },
  'left operand of &&': {
    wrap: (expression, operand = 'a', operator = '&&') =>
      `(${expression}) ${operator} ${operand}`,
    swapped: '||',
  },
  negation: {
    wrap: expression => `!(${expression})`,
    swapped: null,
  },
  condition: {
    wrap: expression => expression,
    swapped: null,
  },
}

/**
 * Languages of the `??` brute force: nullable booleans in TypeScript, and names
 * of unknown type in JavaScript.
 */
const NULLISH_LANGUAGES: Record<string, NullishLanguage> = {
  TypeScript: {
    prefix: [
      'declare function hit(): void',
      'export function f(x: boolean | undefined, y: boolean | undefined, a: boolean) {',
      '  if (',
    ].join('\n'),
    defaults: [undefined, false, true],
    values: [undefined, false, true],
    file: 'example.ts',
  },
  JavaScript: {
    prefix: ['export function f(x, y, a) {', '  if ('].join('\n'),
    values: [undefined, null, false, true, 0, '', 1, 'a'],
    defaults: [undefined, false, true, 0, 'a'],
    file: 'example.js',
  },
}

/**
 * Alternatives of `x ?? D` that no kept mutant covers, the two `??` gaps of
 * catalog 11.8: a `null` default has no truthiness flip, so "a nullish left
 * side becomes truthy" is not probed; and an unknown default gets no swap to
 * `||` (D14).
 */
const NULLISH_GAPS: Record<string, string> = {
  'TypeScript null': 'x ?? true',
  'JavaScript null': 'x ?? true',
  'JavaScript y': 'x || y',
}

/**
 * Lists the cases of the `??` brute force: every language, default and truth
 * position.
 *
 * @returns One case per combination, with its expected gap.
 */
function createNullishCases(): {
  check: ExpressionCheck
  uncovered: string[]
}[] {
  return Object.entries(NULLISH_LANGUAGES).flatMap(([language, setup]) =>
    Object.entries(NULLISH_DEFAULTS).flatMap(([fallback, flip]) =>
      Object.values(NULLISH_CONTEXTS).map(({ swapped, wrap }) => {
        let original = `x ?? ${fallback}`
        let alternatives = [
          fallback,
          'x',
          `x || ${fallback}`,
          `x ?? ${flip}`,
          `true ?? ${fallback}`,
          `false ?? ${fallback}`,
          `undefined ?? ${fallback}`,
          'true',
          'false',
          `!(${original})`,
          `x && ${fallback}`,
        ].map(expression => wrap(expression))
        alternatives.push('true', 'false', `!(${wrap(original)})`)
        if (swapped !== null) {
          alternatives.push(
            wrap(original, 'true'),
            wrap(original, 'false'),
            wrap(original, 'a', swapped),
          )
        }
        let gap = NULLISH_GAPS[`${language} ${fallback}`]
        let defaults = fallback === 'y' ? setup.defaults : [undefined]
        return {
          check: {
            inputs: setup.values.flatMap(x =>
              defaults.flatMap(y => [false, true].map(a => [x, y, a])),
            ),
            expression: wrap(original),
            observe: 'truth' as const,
            names: ['x', 'y', 'a'],
            suffix: ') hit()\n}\n',
            prefix: setup.prefix,
            file: setup.file,
            alternatives,
          },
          uncovered: gap === undefined ? [] : [wrap(gap)],
        }
      }),
    ),
  )
}

/**
 * Generates the random read-once formulas of a brute force with a fixed seed.
 *
 * @param seed - Seed of the generator.
 * @param count - Number of formulas.
 * @param setup - Names and values of the formulas.
 * @returns The formulas with their inputs and classic alternatives.
 */
function createFormulaCases(
  seed: number,
  count: number,
  setup: FormulaSetup,
): FormulaCase[] {
  let random = createRandom(seed)
  return Array.from({ length: count }, () => {
    let booleans = setup.booleans.slice(0, random(setup.booleans.length + 1))
    let numberCount = 1 + random(3)
    let total = booleans.length + numberCount
    let formula = generateFormula(
      random,
      {
        others: setup.pairs ? ['y1', 'y2', 'y3'].slice(0, numberCount) : [],
        numbers: ['x1', 'x2', 'x3'].slice(0, numberCount),
        booleans,
      },
      Math.min(2 + random(Math.max(1, total - 1)), total),
    )
    return {
      alternatives: getClassicAlternatives(formula).map(alternative =>
        printFormula(alternative),
      ),
      ...getFormulaInputs(formula, setup.domains),
      expression: printFormula(formula),
    }
  })
}

describe('generateFileMutants', () => {
  it.each(
    createFormulaCases(12_345, 200, {
      domains: { booleans: [false, true], numbers: NUMBERS },
      booleans: ['a', 'b', 'c'],
      pairs: true,
    }),
  )(
    'keeps no weak mutant and covers every fault of if ($expression)',
    ({ alternatives, expression, inputs, names }) => {
      expect(
        checkExpressionMutants({
          prefix: [
            'declare function hit(): void',
            `function f(${PARAMETERS}) {`,
            '  if (',
          ].join('\n'),
          suffix: ') hit()\n}\n',
          file: 'example.ts',
          observe: 'truth',
          alternatives,
          expression,
          inputs,
          names,
        }),
      ).toStrictEqual(NONE)
    },
  )

  it.each(
    Object.entries(VALUE_CONTEXTS).flatMap(([context, value]) =>
      createFormulaCases(value.seed, 100, {
        domains: {
          booleans:
            value.file === 'example.js' ?
              [undefined, null, false, true, 0, '']
            : [false, true],
          numbers: NUMBERS,
        },
        booleans: ['a', 'b'],
        pairs: false,
      }).map(formula => ({ ...formula, context, value })),
    ),
  )(
    'keeps no weak mutant and covers every fault of the $context $expression',
    ({ alternatives, expression, inputs, value, names }) => {
      expect(
        checkExpressionMutants({
          alternatives: [
            ...alternatives.map(alternative => value.wrap(alternative)),
            ...value.outer(expression),
          ],
          inputs: inputs.map(input => [
            ...input,
            { tag: 'marker' },
            { tag: 'fallback' },
          ]),
          names: [...names, 'marker', 'fallback'],
          expression: value.wrap(expression),
          prefix: value.prefix,
          suffix: value.suffix,
          observe: 'value',
          file: value.file,
        }),
      ).toStrictEqual({
        ...NONE,
        uncovered: value.gaps[expression] ?? [],
      })
    },
  )

  it.each(createNullishCases())(
    'keeps no weak mutant and covers every fault of $check.file if ($check.expression)',
    ({ uncovered, check }) => {
      expect(checkExpressionMutants(check)).toStrictEqual({
        ...NONE,
        uncovered,
      })
    },
  )
})
