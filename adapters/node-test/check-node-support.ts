/**
 * Tells whether mootant runs node:test on a Node version: 20.19 and later 20.x,
 * and 22.12 and later, as `^20.19.0 || >=22.12.0`.
 *
 * @param version - Version of Node, such as `v22.12.0`.
 * @returns Whether the version is supported.
 */
export function checkNodeSupport(version: string): boolean {
  let [major = 0, minor = 0] = version.replace(/^v/u, '').split('.').map(Number)
  return (
    (major === 20 && minor >= 19) || (major === 22 && minor >= 12) || major > 22
  )
}
