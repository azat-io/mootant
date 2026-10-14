import type {
  ObjectExpression,
  ArrayExpression,
  CallExpression,
  NewExpression,
} from 'oxc-parser'

/**
 * Expression with a comma-separated list that `removeListElement` can shorten.
 */
export type ListExpression =
  ObjectExpression | ArrayExpression | CallExpression | NewExpression
