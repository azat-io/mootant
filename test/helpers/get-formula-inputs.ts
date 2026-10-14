import type { Formula } from './generate-formula'

/**
 * Values each kind of name of a formula takes.
 */
export interface FormulaDomains {
  /**
   * Values of boolean names; wider than `false` and `true` for JavaScript,
   * where the names have unknown types.
   */
  booleans: unknown[]

  /**
   * Values of number names.
   */
  numbers: number[]
}

/**
 * Inputs of a formula: its names and every combination of their values.
 */
export interface FormulaInputs {
  /**
   * Values of the names, one row per combination.
   */
  inputs: unknown[][]

  /**
   * Names of the formula, boolean names first, in source order.
   */
  names: string[]
}

/**
 * Enumerates every input of a formula: each boolean name takes each value of
 * `domains.booleans` and each number name each value of `domains.numbers`.
 *
 * @param formula - Formula whose names are enumerated.
 * @param domains - Values of each kind of name.
 * @returns The names and every combination of their values.
 */
export function getFormulaInputs(
  formula: Formula,
  domains: FormulaDomains,
): FormulaInputs {
  let booleans: string[] = []
  let numbers: string[] = []
  collectNames(formula, booleans, numbers)
  let inputs: unknown[][] = [[]]
  let lists = [
    ...booleans.map(() => domains.booleans),
    ...numbers.map(() => domains.numbers),
  ]
  for (let values of lists) {
    inputs = inputs.flatMap(input => values.map(value => [...input, value]))
  }
  return { names: [...booleans, ...numbers], inputs }
}

/**
 * Collects the names of a formula in source order.
 *
 * @param formula - Formula to walk.
 * @param booleans - Boolean names found so far.
 * @param numbers - Number names found so far.
 */
function collectNames(
  formula: Formula,
  booleans: string[],
  numbers: string[],
): void {
  switch (formula.kind) {
    case 'comparison':
      numbers.push(formula.name)
      if (typeof formula.other === 'string') {
        numbers.push(formula.other)
      }
      break
    case 'constant':
      break
    case 'logical':
      collectNames(formula.left, booleans, numbers)
      collectNames(formula.right, booleans, numbers)
      break
    case 'name':
      booleans.push(formula.name)
      break
    case 'not':
      collectNames(formula.operand, booleans, numbers)
      break
  }
}
