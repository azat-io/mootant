/**
 * How Jest's parser reads the words after a flag: `boolean` takes `true` or
 * `false`, `bail` also a number, `value` one word that is not a flag, `array`
 * every word up to the next flag, also after `=`.
 */
export type FlagKind = 'boolean' | 'value' | 'array' | 'bail'
