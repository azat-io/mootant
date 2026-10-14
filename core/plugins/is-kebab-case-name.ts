/**
 * Lowercase words of letters and digits joined by single hyphens, starting with
 * a letter.
 */
const KEBAB_CASE_PATTERN = /^[a-z][\da-z]*(?:-[\da-z]+)*$/u

/**
 * Tells whether a mutator name, preset name or plugin namespace has the
 * kebab-case form that ids are built from.
 *
 * @param value - Name to check.
 * @returns Whether the name is kebab-case, such as `string-literal`.
 */
export function isKebabCaseName(value: string): boolean {
  return KEBAB_CASE_PATTERN.test(value)
}
