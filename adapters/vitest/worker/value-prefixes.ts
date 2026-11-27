/**
 * Prefixes of the names under which the cache keys the values of `provide` and
 * `define` that test code reads, beside the names of environment variables:
 * `provide=<key>` for a provided value, `provide=*` for all of them,
 * `define=<key>` for a define, and `defines=` for the names of the defines of a
 * project. Each holds `=`, which no environment variable name has.
 */
export const VALUE_PREFIXES = {
  defines: 'defines=',
  provide: 'provide=',
  define: 'define=',
}
