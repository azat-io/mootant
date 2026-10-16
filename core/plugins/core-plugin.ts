import type { Plugin } from '../../types/config/plugin'

import { comparisonOperator } from '../mutators/comparison-operator'
import { assignmentOperator } from '../mutators/assignment-operator'
import { arithmeticOperator } from '../mutators/arithmetic-operator'
import { statementRemoval } from '../mutators/statement-removal'
import { optionalChaining } from '../mutators/optional-chaining'
import { logicalOperator } from '../mutators/logical-operator'
import { bitwiseOperator } from '../mutators/bitwise-operator'
import { objectProperty } from '../mutators/object-property'
import { updateOperator } from '../mutators/update-operator'
import { booleanLiteral } from '../mutators/boolean-literal'
import { unaryOperator } from '../mutators/unary-operator'
import { stringLiteral } from '../mutators/string-literal'
import { numberLiteral } from '../mutators/number-literal'
import { missingAwait } from '../mutators/missing-await'
import { arrayElement } from '../mutators/array-element'
import { regexPattern } from '../mutators/regex-pattern'
import { returnValue } from '../mutators/return-value'
import { methodCall } from '../mutators/method-call'
import { recommended } from '../presets/recommended'
import { regexFlag } from '../mutators/regex-flag'
import { condition } from '../mutators/condition'
import { strict } from '../presets/strict'

/**
 * Plugin of the built-in mutators and presets. It has no namespace, so its ids
 * are bare names such as `string-literal` and `recommended`.
 */
export let corePlugin: Plugin = {
  mutators: {
    'arithmetic-operator': arithmeticOperator,
    'assignment-operator': assignmentOperator,
    'comparison-operator': comparisonOperator,
    'optional-chaining': optionalChaining,
    'statement-removal': statementRemoval,
    'bitwise-operator': bitwiseOperator,
    'logical-operator': logicalOperator,
    'boolean-literal': booleanLiteral,
    'object-property': objectProperty,
    'update-operator': updateOperator,
    'number-literal': numberLiteral,
    'string-literal': stringLiteral,
    'unary-operator': unaryOperator,
    'array-element': arrayElement,
    'missing-await': missingAwait,
    'regex-pattern': regexPattern,
    'return-value': returnValue,
    'method-call': methodCall,
    'regex-flag': regexFlag,
    condition,
  },
  presets: { recommended, strict },
}
