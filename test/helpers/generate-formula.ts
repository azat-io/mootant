/**
 * Read-once boolean formula: every name occurs once.
 */
export type Formula =
  | {
      /**
       * Operator of the comparison.
       */
      operator: ComparisonOperator

      /**
       * Literal or name on the other side of the comparison.
       */
      other: number | string

      /**
       * Whether the other side is written first, as in `1 < x1`.
       */
      otherFirst: boolean

      /**
       * Comparison of a number name with a literal or another number name.
       */
      kind: 'comparison'

      /**
       * Number name of the comparison.
       */
      name: string
    }
  | {
      /**
       * Operator of the group.
       */
      operator: '&&' | '||'

      /**
       * Group of two operands.
       */
      kind: 'logical'

      /**
       * Right operand.
       */
      right: Formula

      /**
       * Left operand.
       */
      left: Formula
    }
  | {
      /**
       * Boolean literal, used by the alternatives of a formula.
       */
      kind: 'constant'

      /**
       * Value of the literal.
       */
      value: boolean
    }
  | {
      /**
       * Negated formula.
       */
      operand: Formula

      /**
       * Negation.
       */
      kind: 'not'
    }
  | {
      /**
       * Boolean name.
       */
      kind: 'name'

      /**
       * The name.
       */
      name: string
    }

/**
 * Names a random formula may use, each at most once.
 */
export interface FormulaNames {
  /**
   * Boolean names.
   */
  booleans: string[]

  /**
   * Number names, each compared once.
   */
  numbers: string[]

  /**
   * Number names that a comparison may use as its other side instead of the
   * literal 1, paired by position with `numbers`. Empty for comparisons against
   * the literal only.
   */
  others: string[]
}

/**
 * Relational or equality operator of a comparison atom.
 */
export type ComparisonOperator = '!==' | '===' | '<=' | '>=' | '<' | '>'

/**
 * Comparison operators a random comparison picks from.
 */
const OPERATORS: ComparisonOperator[] = ['<', '<=', '>', '>=', '===', '!==']

/**
 * Generates a random read-once formula of boolean names and comparisons, the
 * formulas of the catalog's brute force (12.2, 12.3). Every atom is negated
 * with probability 1/5 and every group with probability 1/6, as in the
 * prototype that validated the catalog.
 *
 * @param random - Seeded generator of integers below a limit.
 * @param names - Boolean and number names, each used once; the formula takes
 *   them from the front of their lists.
 * @param size - Number of atoms, at most the number of names left.
 * @returns Random formula with that many atoms.
 */
export function generateFormula(
  random: (limit: number) => number,
  names: FormulaNames,
  size: number,
): Formula {
  if (size === 1) {
    let atom = generateAtom(random, names)
    return random(5) === 0 ? { operand: atom, kind: 'not' } : atom
  }
  let leftSize = 1 + random(size - 1)
  let left = generateFormula(random, names, leftSize)
  let right = generateFormula(random, names, size - leftSize)
  let operator: '&&' | '||' = random(2) === 0 ? '||' : '&&'
  let group: Formula = { kind: 'logical', operator, right, left }
  return random(6) === 0 ? { operand: group, kind: 'not' } : group
}

/**
 * Generates one atom: a boolean name or a comparison of a number name.
 *
 * @param random - Seeded generator of integers below a limit.
 * @param names - Names left; the atom takes the first of its kind.
 * @returns Boolean name, or comparison with the literal 1 or another number
 *   name.
 */
function generateAtom(
  random: (limit: number) => number,
  names: FormulaNames,
): Formula {
  let coin = random(2)
  if (names.booleans.length > 0 && (coin === 1 || names.numbers.length === 0)) {
    return { name: names.booleans.shift()!, kind: 'name' }
  }
  let name = names.numbers.shift()!
  let other = names.others.shift()
  let operator = OPERATORS[random(OPERATORS.length)]!
  let otherFirst = random(2) === 1
  if (other !== undefined && random(2) === 1) {
    return { kind: 'comparison', otherFirst, operator, other, name }
  }
  return { kind: 'comparison', otherFirst, other: 1, operator, name }
}
