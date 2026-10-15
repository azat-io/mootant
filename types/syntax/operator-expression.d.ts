import type {
  AssignmentExpression,
  PrivateInExpression,
  LogicalExpression,
  BinaryExpression,
  UpdateExpression,
  UnaryExpression,
} from 'oxc-parser'

/**
 * Expression with an operator token that `replaceOperator` can swap.
 */
export type OperatorExpression =
  | AssignmentExpression
  | PrivateInExpression
  | LogicalExpression
  | BinaryExpression
  | UpdateExpression
  | UnaryExpression
