/**
 * Methods whose result is a string that is never empty: the date formatters
 * `toISOString`, which throws for an invalid date, and `toUTCString`, which
 * writes "Invalid Date" for one, and the number formatters `toFixed`,
 * `toExponential` and `toPrecision`, which always write a digit, `NaN` or
 * `Infinity`. The names are a heuristic: an arbitrary object may define a
 * method of the same name that returns an empty string.
 */
export const NEVER_EMPTY_METHODS: ReadonlySet<string> = new Set([
  'toExponential',
  'toPrecision',
  'toISOString',
  'toUTCString',
  'toFixed',
])
