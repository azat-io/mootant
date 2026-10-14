import type { ComparisonOperator, Formula } from './generate-formula'

/**
 * Comparison operators a comparison can be replaced with.
 */
const OPERATORS: ComparisonOperator[] = ['<', '<=', '>', '>=', '===', '!==']

/**
 * Lists the classic alternatives of a formula, the faults the catalog's brute
 * force checks the kept mutants against (12.2): every sub-formula forced to
 * `true`, forced to `false` and negated, every `&&` <-> `||` swap, every other
 * operator of a comparison, and a comparison literal plus and minus one.
 *
 * @param formula - Original formula.
 * @returns Whole formulas, each with one alternative applied.
 */
export function getClassicAlternatives(formula: Formula): Formula[] {
  let alternatives: Formula[] = []
  let pending = [formula]
  for (let target = pending.pop(); target; target = pending.pop()) {
    let changes: Formula[] = [
      { kind: 'constant', value: true },
      { kind: 'constant', value: false },
      { operand: target, kind: 'not' },
    ]
    switch (target.kind) {
      case 'comparison': {
        let { operator, other } = target
        for (let replacement of OPERATORS) {
          if (replacement !== operator) {
            changes.push({ ...target, operator: replacement })
          }
        }
        if (typeof other === 'number') {
          changes.push(
            { ...target, other: other + 1 },
            { ...target, other: other - 1 },
          )
        }
        break
      }
      case 'logical':
        changes.push({
          ...target,
          operator: target.operator === '&&' ? '||' : '&&',
        })
        pending.push(target.right, target.left)
        break
      case 'not':
        pending.push(target.operand)
        break
      default:
        break
    }
    for (let change of changes) {
      alternatives.push(replaceFormula(formula, target, change))
    }
  }
  return alternatives
}

/**
 * Replaces one sub-formula, found by identity.
 *
 * @param formula - Formula to copy.
 * @param target - Sub-formula to replace.
 * @param replacement - Formula written in its place.
 * @returns Copy of the formula with the replacement.
 */
function replaceFormula(
  formula: Formula,
  target: Formula,
  replacement: Formula,
): Formula {
  if (formula === target) {
    return replacement
  }
  if (formula.kind === 'logical') {
    return {
      ...formula,
      right: replaceFormula(formula.right, target, replacement),
      left: replaceFormula(formula.left, target, replacement),
    }
  }
  if (formula.kind === 'not') {
    return {
      ...formula,
      operand: replaceFormula(formula.operand, target, replacement),
    }
  }
  return formula
}
