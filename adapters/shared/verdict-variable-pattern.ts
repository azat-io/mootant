/**
 * Environment variables that change verdicts of code that never reads them
 * through `process.env`, such as dates and collation, and the mode libraries
 * pick up.
 */
export const VERDICT_VARIABLE_PATTERN = /^(?:NODE_ENV|LANG|LC_.+|TZ)$/u
