import type { TestProject } from 'vitest/node'

import path from 'node:path'

import { listTsconfigFiles } from '../shared/list-tsconfig-files'
import { compareCodeUnits } from '../../core/compare-code-units'
import { isVirtualModule } from './is-virtual-module'
import { getModuleFile } from './get-module-file'

/**
 * Module of Vite's module graph, as much of it as mootant reads.
 */
interface GraphNode {
  /**
   * Modules it imports, statically or by a literal dynamic import.
   */
  importedModules: Set<GraphNode>

  /**
   * Result of its transform, or null when it was never transformed.
   */
  transformResult: unknown

  /**
   * File of the module, which is its id without the query or hash for a module
   * Vite resolved, a virtual one too, or null when Vite knows none.
   */
  file: string | null

  /**
   * Resolved id of the module, or null before it is resolved.
   */
  id: string | null

  /**
   * URL Vite transforms the module by.
   */
  url: string
}

/**
 * Vite environment, as much of it as mootant reads.
 */
interface GraphEnvironment {
  /**
   * Module graph of the environment.
   */
  moduleGraph: { getModuleById(id: string): GraphNode | undefined }

  /**
   * Transforms a module, filling its imports in the module graph.
   */
  transformRequest(url: string): Promise<unknown>
}

/**
 * Turns what a worker reported a test file depended on into absolute paths: the
 * files of the modules it evaluated, of the CommonJS modules it required and
 * its snapshot files, plus every project module those modules reach in Vite's
 * module graph, transitively, which takes in files plugins watch and literal
 * dynamic imports that did not run, with all they import: modules that were
 * never transformed are transformed first, so their imports are known. Each
 * directory of those files adds the `tsconfig.json` files that may decide how
 * Vite transforms it (`listTsconfigFiles`). Virtual modules (`isVirtualModule`)
 * are followed but not listed, so the files plugins watch for them are in;
 * files under `node_modules`, which the lockfile stands for, are left out with
 * what they import. The test file itself is always in.
 *
 * @param input - Test file, its project and what its worker reported.
 * @param input.project - Project the test file ran in.
 * @param input.file - Absolute path of the test file.
 * @param input.reported - Module ids and paths the worker reported, or
 *   undefined or null when it reported none, as when it crashed or could not
 *   tell.
 * @param input.tsconfigs - `tsconfig.json` files found before, by directory;
 *   shared by the test files of a run.
 * @returns Absolute paths, sorted, or null without a report.
 */
export async function collectDependencies(input: {
  reported: undefined | string[] | null
  tsconfigs: Map<string, string[]>
  project: TestProject
  file: string
}): Promise<string[] | null> {
  let { reported, project } = input
  if (reported === undefined || reported === null) {
    return null
  }
  let files = new Set([input.file])
  /**
   * Tells whether to follow the imports of a module, those of a project file or
   * of a virtual module, and adds the file of a project file.
   *
   * @param candidate - Module id or path.
   * @returns Whether to follow the imports of the module.
   */
  function follow(candidate: string): boolean {
    let file = getModuleFile(candidate)
    if (file === null) {
      return isVirtualModule(candidate)
    }
    files.add(file)
    return true
  }
  let environments: GraphEnvironment[] = Object.values(
    project.vite.environments,
  )
  let seen = new Set<GraphNode>()
  /**
   * Follows the imports of a module, transforming it first when it was never
   * transformed: adds the project files among them, then what they and the
   * virtual modules among them import.
   *
   * @param node - Module, already seen.
   * @param environment - Environment of its module graph.
   */
  async function visit(
    node: GraphNode,
    environment: GraphEnvironment,
  ): Promise<void> {
    if (node.transformResult === null) {
      try {
        await environment.transformRequest(node.url)
      } catch {}
    }
    let next = [...node.importedModules].filter(
      imported =>
        !seen.has(imported) && follow(imported.file ?? imported.id ?? ''),
    )
    for (let imported of next) {
      seen.add(imported)
    }
    await Promise.all(next.map(imported => visit(imported, environment)))
  }
  let roots: Promise<void>[] = []
  for (let id of reported) {
    if (!follow(id)) {
      continue
    }
    for (let environment of environments) {
      let node = environment.moduleGraph.getModuleById(id)
      if (node !== undefined) {
        if (!seen.has(node)) {
          seen.add(node)
          roots.push(visit(node, environment))
        }
        break
      }
    }
  }
  await Promise.all(roots)
  let directories = new Set([...files].map(path.dirname))
  for (let directory of directories) {
    let tsconfigs = listTsconfigFiles(directory, input.tsconfigs)
    for (let tsconfig of tsconfigs) {
      files.add(tsconfig)
    }
  }
  return [...files].toSorted(compareCodeUnits)
}
