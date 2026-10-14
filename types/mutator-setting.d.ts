/**
 * Setting of one mutator in a preset: off, on with its default options, or on
 * with options merged over the defaults.
 */
export type MutatorSetting = ['on', object] | 'off' | 'on'
