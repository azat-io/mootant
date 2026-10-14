import type { WeakMutants } from './find-weak-mutants'

import { evaluateExpression } from './evaluate-expression'
import { findWeakMutants } from './find-weak-mutants'
import { generateMutants } from './generate-mutants'
import { describeValue } from './describe-value'

/**
 * Expression of a snippet whose mutants a brute force checks, with its inputs
 * and the faults its mutants should cover.
 */
export interface ExpressionCheck {
  /**
   * What the position of the expression observes: only its truth value, as a
   * condition does, or its exact value.
   */
  observe: 'value' | 'truth'

  /**
   * Classic faults of the expression, each written as a whole expression.
   */
  alternatives: string[]

  /**
   * Values of the names, one row per input.
   */
  inputs: unknown[][]

  /**
   * Text of the expression.
   */
  expression: string

  /**
   * Names the expression reads, in the order of the input values.
   */
  names: string[]

  /**
   * Text of the snippet after the expression.
   */
  suffix: string

  /**
   * Text of the snippet before the expression.
   */
  prefix: string

  /**
   * File name of the snippet, whose extension selects the language.
   */
  file: string
}

/**
 * Runs the whole pipeline under `recommended` over a snippet, keeps the mutants
 * inside one expression, and checks them the way the catalog's brute force does
 * (12.2 to 12.4): each mutant is written into the expression in parentheses, as
 * the hosting rule writes it, and evaluated on every input together with the
 * original and the alternatives. Mutants are labeled `mutator original ->
 * replacement`; alternatives by their text.
 *
 * @param check - Snippet, expression, inputs and alternatives.
 * @returns The equivalent, duplicate and subsumed mutants and the uncovered
 *   alternatives.
 */
export function checkExpressionMutants(check: ExpressionCheck): WeakMutants {
  let { alternatives, expression, observe, prefix, suffix, inputs, names } =
    check
  let source = `${prefix}${expression}${suffix}`
  let start = prefix.length
  let end = start + expression.length
  let mutants = generateMutants(source, { file: check.file }).filter(
    mutant => mutant.start >= start && mutant.end <= end,
  )

  /**
   * Evaluates a variant of the expression on every input.
   *
   * @param text - Variant of the expression.
   * @returns Canonical text of each observed output.
   */
  function observeOutputs(text: string): string[] {
    return evaluateExpression(text, names, inputs).map(value =>
      observe === 'truth' ? String(Boolean(value)) : describeValue(value),
    )
  }

  return findWeakMutants(
    observeOutputs(expression),
    mutants.map(mutant => ({
      outputs: observeOutputs(
        `${source.slice(start, mutant.start)}(${mutant.replacement})${source.slice(mutant.end, end)}`,
      ),
      label: `${mutant.mutator} ${source.slice(mutant.start, mutant.end)} -> ${mutant.replacement}`,
    })),
    alternatives.map(alternative => ({
      outputs: observeOutputs(alternative),
      label: alternative,
    })),
  )
}
