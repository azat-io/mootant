/**
 * Tells whether `new RegExp` accepts a pattern with flags, on the Node.js
 * version that runs mootant.
 *
 * @param pattern - Pattern as the regular expression sees it.
 * @param flags - Flags, such as `gi`.
 * @returns Whether the regular expression compiles.
 */
export function compilesRegex(pattern: string, flags: string): boolean {
  try {
    return new RegExp(pattern, flags) instanceof RegExp
  } catch {
    return false
  }
}
