/**
 * Global objects whose `console` property is the global console.
 */
const CONSOLE_OWNERS = new Set(['globalThis', 'window'])

/**
 * Tells whether a member path (see `getMemberPath`) names a method of the
 * global console by its names: `console.log`, or the same through the `console`
 * property of a global object, such as `globalThis.console.log` or
 * `window.console.log`. Whether the root name is bound in the file, and so not
 * the global, is up to the caller.
 *
 * @param path - Names from the root of the chain to the outermost member.
 * @returns Whether the path is a method of the global console.
 */
export function isConsolePath(path: readonly string[]): boolean {
  if (path.length === 2) {
    return path[0] === 'console'
  }
  return (
    path.length === 3 && CONSOLE_OWNERS.has(path[0]!) && path[1] === 'console'
  )
}
