import { isKebabCaseName } from './is-kebab-case-name'

/**
 * Tells whether a string has the form of a mutator id: a kebab-case name for a
 * core mutator, or a kebab-case namespace, a slash and a kebab-case name for a
 * plugin mutator. Such ids never contain spaces, commas or colons.
 *
 * @param value - String to check.
 * @returns Whether the string is `name` or `namespace/name`.
 */
export function isMutatorId(value: string): boolean {
  let parts = value.split('/')
  return parts.length <= 2 && parts.every(part => isKebabCaseName(part))
}
