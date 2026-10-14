import type { Formula } from './generate-formula'

/**
 * Writes a formula as source text. Groups and negated operands are wrapped in
 * parentheses, so the text keeps the structure of the formula.
 *
 * @param formula - Formula to write.
 * @returns Source text of the formula, such as `(a && !(x1 < 1))`.
 */
export function printFormula(formula: Formula): string {
  switch (formula.kind) {
    case 'comparison': {
      let { otherFirst, operator, other, name } = formula
      return otherFirst ?
          `${other} ${operator} ${name}`
        : `${name} ${operator} ${other}`
    }
    case 'constant':
      return String(formula.value)
    case 'logical':
      return `(${printFormula(formula.left)} ${formula.operator} ${printFormula(formula.right)})`
    case 'name':
      return formula.name
    case 'not':
      return `!(${printFormula(formula.operand)})`
  }
}
