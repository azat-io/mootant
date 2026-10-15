import { lilconfig } from 'lilconfig'
import path from 'node:path'

import type { Config } from '../../types/config/config'

import { loadTypescriptConfig } from './load-typescript-config'
import { validateConfig } from './validate-config'
import { importConfig } from './import-config'

/**
 * Configuration file found for a run.
 */
export interface LoadedConfig {
  /**
   * Directory of the file: the project root.
   */
  directory: string

  /**
   * Checked configuration.
   */
  config: Config

  /**
   * Absolute path of the file.
   */
  file: string
}

/**
 * Files searched for a configuration, in each directory from the working
 * directory up: the `mootant` key of `package.json`, `.mootantrc` and
 * `.mootantrc.json` as JSON, and `mootant.config` scripts.
 */
let searchPlaces = [
  'package.json',
  '.mootantrc',
  '.mootantrc.json',
  'mootant.config.js',
  'mootant.config.mjs',
  'mootant.config.cjs',
  'mootant.config.ts',
  'mootant.config.mts',
  'mootant.config.cts',
]

/**
 * Finds and loads the configuration of a run: the file given with `--config`,
 * or the first configuration found from the working directory up to the home
 * directory. JavaScript files are imported and their default export is the
 * configuration; TypeScript files too, through `loadTypescriptConfig`. An empty
 * file, with nothing but whitespace, given with `--config` is an empty
 * configuration; the search skips empty files. A script with any other content,
 * even only a comment, must have a default export.
 *
 * @param configPath - Path given with `--config`, relative to the working
 *   directory, or undefined to search.
 * @param cwd - Working directory of the run.
 * @returns The checked configuration with its file, or null when no file is
 *   found by the search.
 * @throws Error - When the given file is missing, a file cannot be loaded or
 *   its configuration is invalid.
 */
export async function loadConfig(
  configPath: undefined | string,
  cwd: string,
): Promise<LoadedConfig | null> {
  let explorer = lilconfig('mootant', {
    loaders: {
      '.cts': loadTypescriptConfig,
      '.mts': loadTypescriptConfig,
      '.ts': loadTypescriptConfig,
      '.cjs': importConfig,
      '.mjs': importConfig,
      '.js': importConfig,
    },
    packageProp: 'mootant',
    searchPlaces,
  })
  let result
  try {
    result =
      configPath === undefined ?
        await explorer.search(cwd)
      : await explorer.load(path.resolve(cwd, configPath))
  } catch (error) {
    let { message, code } = error as NodeJS.ErrnoException
    if (code === 'ENOENT' && configPath !== undefined) {
      throw new Error(`Cannot find the configuration file ${configPath}.`, {
        cause: error,
      })
    }
    let source = configPath ?? 'the configuration'
    throw new Error(`Cannot load ${source}: ${message}`, { cause: error })
  }
  if (result === null) {
    return null
  }
  let file = result.filepath
  return {
    config:
      result.isEmpty === true ?
        {}
      : validateConfig(result.config, path.relative(cwd, file)),
    directory: path.dirname(file),
    file,
  }
}
