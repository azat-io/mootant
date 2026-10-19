/**
 * Loggers of the `recommended` preset: the `console` methods, the log methods
 * of receivers named `log`, `logger` or ending with `Logger`, and the bare
 * `log` and `debug` functions called with a text first.
 */
export const DEFAULT_LOGGERS: readonly string[] = [
  'console',
  'log',
  'logger',
  '*Logger',
  'debug',
]
