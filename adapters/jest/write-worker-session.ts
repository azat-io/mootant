import { writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { JestGlobalConfig } from './types/jest-global-config'
import type { WorkerSession } from './types/worker-session'
import type { JestPackages } from './types/jest-packages'
import type { JestProject } from './types/jest-project'
import type { JestReady } from './types/jest-ready'

/**
 * Extension of the snapshot files Jest resolves, which a custom resolver gets
 * and may put anywhere.
 */
const SNAPSHOT_EXTENSION = 'snap'

/**
 * Writes `session.json`, which workers read at boot: the packages, the global
 * configuration, the mask of new files global setup left, what the reads of a
 * unit count, and, for each kept project that has test files, its haste map and
 * its configuration as the session gives it (`readHostConfig`). Reads count
 * under the project root and the `rootDir` and `roots` of every kept project,
 * or with an extension of their modules or of a snapshot. Main is its only
 * writer.
 *
 * @param input - What to write.
 * @param input.globalConfig - Global configuration.
 * @param input.directory - Directory of the file.
 * @param input.packages - Jest packages of the project.
 * @param input.projects - Kept projects.
 * @param input.ready - The host's `ready` message.
 * @param input.root - Real path of the project root.
 * @returns Absolute path of the file, once it is written.
 */
export async function writeWorkerSession(input: {
  projects: readonly JestProject[]
  globalConfig: JestGlobalConfig
  packages: JestPackages
  directory: string
  ready: JestReady
  root: string
}): Promise<string> {
  let projects = input.projects.flatMap(({ config }) => {
    let moduleMap = input.ready.moduleMaps[config.id]
    return moduleMap === undefined ? [] : { id: config.id, moduleMap, config }
  })
  let configs = input.projects.map(({ config }) => config)
  let reads: WorkerSession['reads'] = {
    extensions: [
      ...new Set([
        ...configs.flatMap(config => config.moduleFileExtensions),
        SNAPSHOT_EXTENSION,
      ]),
    ],
    directories: [
      ...new Set([
        input.root,
        ...configs.flatMap(config => [config.rootDir, ...config.roots]),
      ]),
    ],
  }
  let file = path.join(input.directory, 'session.json')
  await writeFile(
    file,
    JSON.stringify({
      globalConfig: input.globalConfig,
      packages: input.packages,
      umask: input.ready.umask,
      projects,
      reads,
    }),
  )
  return file
}
