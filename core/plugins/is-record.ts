/**
 * Tells whether a value is an object that holds named entries: not null, not an
 * array and not a function.
 *
 * @param value - Value read from a configuration file or a plugin.
 * @returns Whether the value is such an object.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
