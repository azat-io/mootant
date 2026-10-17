import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

/**
 * Reads the hashes of the environment variables the first worker of each
 * project wrote in a dry run, as Vitest set them up for test files. A file cut
 * off by a stopped worker is ignored.
 *
 * @param directory - Work directory of the session.
 * @returns Hashes of the values by name, by project name.
 */
export function readEnvironmentHashes(
  directory: string,
): Record<string, Record<string, string>> {
  let folder = path.join(directory, 'env')
  let projects: Record<string, Record<string, string>> = {}
  for (let name of readdirSync(folder)) {
    try {
      let content = JSON.parse(
        readFileSync(path.join(folder, name), 'utf8'),
      ) as { variables: Record<string, string>; project: string }
      projects[content.project] = content.variables
    } catch {
      continue
    }
  }
  return projects
}
