/**
 * Reads the name of a Node flag as Node's option parser reads it: the part
 * before `=`, with `_` after the first two characters taken as `-`, so
 * `--experimental_loader=./hooks.mjs` is `--experimental-loader`.
 *
 * @param flag - Word of Node flags, such as `--import=tsx`.
 * @returns What Node calls the flag, such as `--experimental-loader`.
 */
export function readFlagName(flag: string): string {
  let name = flag.split('=', 1)[0]!
  return name.slice(0, 2) + name.slice(2).replaceAll('_', '-')
}
