/**
 * Builds the location hash of a file of the report with each part of its path
 * escaped, so that a `:` or a `#` in a name is not read as a line or as the end
 * of the hash. The hash needs no escaping in an attribute.
 *
 * @param path - Path relative to the project root, with `/` separators.
 * @param line - 1-based line to scroll to, if any.
 * @returns Hash such as `#/file/src/a%20b.ts:12`.
 */
export function getFileHref(path: string, line?: number): string {
  let escaped = path
    .split('/')
    .map(part => encodeURIComponent(part))
    .join('/')
  return `#/file/${escaped}${line === undefined ? '' : `:${line}`}`
}
