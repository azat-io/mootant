import type { TestProject, Vitest } from 'vitest/node'

import { inspect } from 'node:util'
import path from 'node:path'

import type { CacheInputs } from '../../types/adapter/cache-inputs'

import { VERDICT_VARIABLE_PATTERN } from '../shared/verdict-variable-pattern'
import { indexEnvironmentHashes } from '../shared/index-environment-hashes'
import { createDigest } from '../../core/cache/create-digest'
import { VITEST_VARIABLES } from './worker/vitest-variables'
import { VALUE_PREFIXES } from './worker/value-prefixes'
import { getModuleFile } from './get-module-file'

/**
 * Pattern of a test environment given as a path rather than a name.
 */
const PATH_PATTERN = /^\.{0,2}[/\\]|^[a-z]:/iu

/**
 * Options of `inspect` that write every part of a value, for values that are
 * not plain JSON, such as big integers, maps and dates that global setup files
 * `provide`, the values of getters and the fields of objects that describe
 * themselves, such as buffers, included, as workers get them all.
 */
const INSPECT_OPTIONS = {
  maxStringLength: Infinity,
  maxArrayLength: Infinity,
  breakLength: Infinity,
  customInspect: false,
  depth: Infinity,
  getters: true,
}

/**
 * Lists what every verdict of a Vitest session depends on beyond the modules of
 * each test file: the configuration files of Vitest with the files they import
 * and the files of every project (`addProjectFiles`); the resolved settings of
 * every project that change verdicts (`describeProjectSettings`); and the
 * hashes of the environment variables the workers of each project saw, with `*`
 * for all of them but those that change from shell to shell, and of the values
 * of `provide` and `define` of each project (`hashValues`), which count only
 * for the test files that read them.
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
    let hashes = indexEnvironmentHashes(
      Object.entries(variables[project.name] ?? {}),
      VITEST_VARIABLES,
    )
    environment[project.name] = { ...hashes, ...hashValues(project) }
    addProjectFiles(project, files)
    settings.push(describeProjectSettings(project, hashes))
  }
  return { files: [...files], environment, settings }
}

/**
 * Describes the resolved settings of a project that change verdicts, without
 * concurrency and without the values of `provide` and `define`, which count by
 * name (`hashValues`): with `dangerouslyIgnoreUnhandledErrors` and the source
 * of `onUnhandledError` of the root configuration, which decide for every
 * project whether unhandled errors count, and with `TZ`, `NODE_ENV`, `LANG` and
 * the `LC_*` variables, which change verdicts whether test code reads them or
 * not.
 *
 * @param project - Vitest project.
 * @param hashes - Hashes of the environment variables the project's workers
 *   saw, by name (`indexEnvironmentHashes`).
 * @returns Settings for the cache key.
 */
function describeProjectSettings(
  project: TestProject,
  hashes: Readonly<Record<string, string>>,
): Record<string, unknown> {
  let { config } = project
  let filter = project.vitest.state.onUnhandledError
  return {
    sequence: {
      seed: config.sequence.shuffle ? config.sequence.seed : null,
      concurrent: config.sequence.concurrent,
      shuffle: config.sequence.shuffle,
      hooks: config.sequence.hooks,
    },
    variables: Object.entries(hashes).filter(([name]) =>
      VERDICT_VARIABLE_PATTERN.test(name),
    ),
    dangerouslyIgnoreUnhandledErrors:
      project.globalConfig.dangerouslyIgnoreUnhandledErrors,
    onUnhandledError: filter ? String(filter) : null,
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
  }
}

/**
 * Hashes the values of `provide` and `define` of a project under the names its
 * workers report reads of them by (`trackValues`): each provided value but the
 * options mootant provides its workers, and all of them under `provide=*`; each
 * define by every value the project gives it, in `defines`, which Vitest sets
 * as globals, and in `_scriptDefines`, which it runs as a script, as a project
 * that shares the server of its parent may hold one key in both, a value given
 * as code by its text; and, under `defines=`, which every test file of the
 * project reads, the names of the defines with what Vite keeps of `define`.
 *
 * @param project - Vitest project.
 * @returns Hashes by name.
 */
function hashValues(project: TestProject): Record<string, string> {
  let { config } = project
  let provided = Object.entries(project.getProvidedContext()).filter(
    ([key]) => key !== 'mootant',
  )
  let scripted = (Reflect.get(config, '_scriptDefines') ?? {}) as Record<
    string,
    unknown
  >
  let globals = config.defines as Record<string, unknown>
  let keys = new Set([...Object.keys(globals), ...Object.keys(scripted)])
  let hashes: Record<string, string> = {}
  for (let [key, value] of provided) {
    hashes[`${VALUE_PREFIXES.provide}${key}`] = hashValue(value)
  }
  hashes[`${VALUE_PREFIXES.provide}*`] = hashValue(provided)
  for (let key of keys) {
    hashes[`${VALUE_PREFIXES.define}${key}`] = hashValue(
      [globals, scripted].map(defines =>
        Object.hasOwn(defines, key) ? [defines[key]] : [],
      ),
    )
  }
  hashes[VALUE_PREFIXES.defines] = hashValue([
    Object.keys(globals),
    Object.keys(scripted),
    project.vite.config.define ?? null,
  ])
  return hashes
}

/**
 * Adds the files the verdicts of a project depend on beyond the modules of each
 * test file: the configuration files of the project with the files they import,
 * the `.env` files Vite loads for it, global setup files with every file the
 * main process evaluated for them (`getModuleFile`), and a test environment
 * given as a path, which loads outside the modules of a test file. With Vite's
 * module runner off, Node imports global setup files itself and only the files
 * themselves are known.
 *
 * @param project - Vitest project.
 * @param files - Receives the files, in this order.
 */
function addProjectFiles(project: TestProject, files: Set<string>): void {
  let { config } = project
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
}

/**
 * Hashes a value by every part of it (`INSPECT_OPTIONS`).
 *
 * @param value - Value to hash.
 * @returns SHA-256 in hex.
 */
function hashValue(value: unknown): string {
  return createDigest(inspect(value, INSPECT_OPTIONS))
}
