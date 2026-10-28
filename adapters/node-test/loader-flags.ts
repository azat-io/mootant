/**
 * Flags that load a module before the test file.
 */
export const LOADER_FLAGS = new Set([
  '--experimental-loader',
  '--require',
  '--import',
  '--loader',
  '-r',
])
