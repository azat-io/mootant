/**
 * Runtime category of a value, as far as mutators need to tell values apart.
 * `object` covers every object that is not an array, a function or a promise.
 */
export type ValueKind =
  | 'undefined'
  | 'function'
  | 'boolean'
  | 'promise'
  | 'string'
  | 'number'
  | 'bigint'
  | 'object'
  | 'symbol'
  | 'array'
  | 'null'
