import type { Vitest } from 'vitest/node'

import { inspect } from 'node:util'
import path from 'node:path'

import type { CacheInputs } from '../../types/adapter/cache-inputs'

import { VERDICT_VARIABLE_PATTERN } from '../shared/verdict-variable-pattern'
import { indexEnvironmentHashes } from '../shared/index-environment-hashes'
import { VITEST_VARIABLES } from './worker/vitest-variables'
import { getModuleFile } from './get-module-file'

/**
 * Pattern of a test environment given as a path rather than a name.
 */
const PATH_PATTERN = /^\.{0,2}[/\\]|^[a-z]:/iu

/**
 * Options of `inspect` that write every part of a value, for values that are
 * not plain JSON, such as big integers, maps and dates that global setup files
 * `provide`.
 */
const INSPECT_OPTIONS = {
  maxStringLength: Infinity,
  maxArrayLength: Infinity,
  breakLength: Infinity,
  depth: Infinity,
}

/**
 * Lists what every verdict of a Vitest session depends on beyond the modules of
 * each test file: the configuration files of Vitest and of every project with
 * the files they import, the `.env` files Vite loads for each project, global
 * setup files with every project file the main process evaluated for them, and
 * test environments given as paths, which load outside the modules of a test
 * file; the resolved settings of every project that change verdicts, without
 * concurrency, with the values of Vite's `define`, which Vitest moves to
 * `defines` and `_scriptDefines` of the project, and those global setup files
 * `provide`, which configuration and global setup may take from files and
 * environment variables of the main process (but the options mootant provides
 * its workers), with `TZ`, `NODE_ENV`, `LANG` and the `LC_*` variables, which
 * change verdicts whether test code reads them or not; and the hashes of the
 * environment variables the workers of each project saw, with `*` for all of
 * them but those that change from shell to shell. With Vite's module runner
 * off, Node imports global setup files itself and only the files themselves are
 * known.
 *
 * @param vitest - Vitest instance of the session.
 * @param variables - Hashes of the environment variables of each project's
 *   workers in the last dry run, by name, by project name.
 * @returns Files, settings and environment variables for the cache key.
 */
export function getCacheInputs(
  vitest: Vitest,
  variables: Readonly<Record<string, Record<string, string>>>,
): CacheInputs {
  let files = new Set(vitest.vite.config.configFileDependencies)
  let environment: Record<string, Record<string, string>> = {}
  let settings: unknown[] = []
  for (let project of vitest.projects) {
    let { config } = project
    let hashes = indexEnvironmentHashes(
      Object.entries(variables[project.name] ?? {}),
      VITEST_VARIABLES,
    )
    environment[project.name] = hashes
    for (let file of project.vite.config.configFileDependencies) {
      files.add(file)
    }
    let { envDir, mode } = project.vite.config
    if (envDir !== false) {
      for (let name of [
        '.env',
        '.env.local',
        `.env.${mode}`,
        `.env.${mode}.local`,
      ]) {
        files.add(path.join(envDir, name))
      }
    }
    for (let file of config.globalSetup) {
      files.add(file)
    }
    let runner = Reflect.get(project, 'runner') as {
      evaluatedModules?: { idToModuleMap: Map<string, unknown> }
    }
    if (runner.evaluatedModules !== undefined) {
      let ids = [...runner.evaluatedModules.idToModuleMap.keys()]
      for (let id of ids) {
        let file = getModuleFile(id)
        if (file !== null) {
          files.add(file)
        }
      }
    }
    if (PATH_PATTERN.test(config.environment)) {
      files.add(path.resolve(config.root, config.environment))
    }
    settings.push({
      values: inspect(
        [
          project.vite.config.define ?? null,
          config.defines,
          Reflect.get(config, '_scriptDefines') ?? null,
          Object.entries(project.getProvidedContext()).filter(
            ([key]) => key !== 'mootant',
          ),
        ],
        INSPECT_OPTIONS,
      ),
      sequence: {
        seed: config.sequence.shuffle ? config.sequence.seed : null,
        concurrent: config.sequence.concurrent,
        shuffle: config.sequence.shuffle,
        hooks: config.sequence.hooks,
      },
      variables: Object.entries(hashes).filter(([name]) =>
        VERDICT_VARIABLE_PATTERN.test(name),
      ),
      environmentOptions: config.environmentOptions,
      update: config.snapshotOptions.updateSnapshot,
      maxConcurrency: config.maxConcurrency,
      environment: config.environment,
      testTimeout: config.testTimeout,
      hookTimeout: config.hookTimeout,
      isolate: config.isolate,
      retry: config.retry,
      name: project.name,
      pool: config.pool,
      env: config.env,
    })
  }
  return { files: [...files], environment, settings }
}
