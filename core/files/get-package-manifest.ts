import path from 'node:path'

/**
 * Pattern of a path in an installed package: what precedes the last
 * `node_modules` segment, the segment and the name of the package, scoped or
 * not, followed by a separator.
 */
const PACKAGE_PATTERN =
  /^(?<root>.*[/\\]node_modules[/\\](?:@[^/\\]+[/\\])?[^/\\]+)[/\\]/u

/**
 * Gives the `package.json` of the installed package a file lies in: the one in
 * the directory under the last `node_modules` of its path, `@scope/name`
 * included, whose `main` and `exports` decide what an import of the package
 * resolves to, also when a `package.json` closer to the file only decides its
 * format.
 *
 * @param file - Absolute path.
 * @returns Absolute path of the manifest, or null for a file that lies in no
 *   package under `node_modules`.
 */
export function getPackageManifest(file: string): string | null {
  let root = PACKAGE_PATTERN.exec(file)?.groups?.['root']
  return root === undefined ? null : path.join(root, 'package.json')
}
