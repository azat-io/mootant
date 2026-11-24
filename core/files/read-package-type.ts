import { readFileSync } from 'node:fs'

/**
 * Reads the `type` field of a `package.json`.
 *
 * @param file - Absolute path of the `package.json`, which may be missing.
 * @param cache - Fields read before, by path; filled here.
 * @returns The field, or null when the file or the field is missing.
 */
export function readPackageType(
  file: string,
  cache: Map<string, unknown>,
): unknown {
  if (!cache.has(file)) {
    let type: unknown = null
    try {
      let manifest = JSON.parse(readFileSync(file, 'utf8')) as {
        type?: unknown
      }
      type = manifest.type ?? null
    } catch {}
    cache.set(file, type)
  }
  return cache.get(file)
}
