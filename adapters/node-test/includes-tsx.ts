/**
 * Specifier of tsx or of a module inside it.
 */
const TSX = /(?:^|[/\\])tsx(?:$|[/@\\])/u

/**
 * Tells whether Node flags load tsx: whether one of the modules they load is
 * tsx or a module inside it, such as `tsx`, `tsx/esm` or a path into its
 * package.
 *
 * @param loaders - Modules Node flags load before the test file.
 * @returns Whether one of them is tsx.
 */
export function includesTsx(loaders: readonly string[]): boolean {
  return loaders.some(loader => TSX.test(loader))
}
