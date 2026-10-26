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
 * Loaders of configuration files by extension: scripts are imported, other
 * files, `package.json` included, are read as JSON.
 */
let loaders: Record<string, (file: string, text: string) => unknown> = {
  '.cts': loadTypescriptConfig,
  '.mts': loadTypescriptConfig,
  '.ts': loadTypescriptConfig,
  '.cjs': importConfig,
  '.mjs': importConfig,
  '.js': importConfig,
  '.json': parseJson,
  noExt: parseJson,
}

/**
 * Finds and loads the configuration of a run: the file given with `--config`,
 * or the first configuration found from the working directory up to the home
 * directory. JavaScript files are imported and their default export is the
 * configuration; TypeScript files too, through `loadTypescriptConfig`. An empty
 * file, with nothing but whitespace, given with `--config` is an empty
 * configuration; the search skips empty files. A script with any other content,
 * even only a comment, must have a default export. The error of a file that
 * cannot be loaded names it relative to the working directory: lilconfig leaves
 * the file out, so the loaders remember the one that fails.
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
  let failed: undefined | string
  let explorer = lilconfig('mootant', {
    loaders: Object.fromEntries(
      Object.entries(loaders).map(([extension, loader]) => [
        extension,
        async (file: string, text: string): Promise<unknown> => {
          try {
            return await loader(file, text)
          } catch (error) {
            failed = file
            throw error
          }
        },
      ]),
    ),
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
    if (failed !== undefined) {
      throw new Error(`Cannot load ${path.relative(cwd, failed)}: ${message}`, {
        cause: error,
      })
    }
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

/**
 * Reads a configuration file as JSON.
 *
 * @param _file - Absolute path of the file, which the text does not need.
 * @param text - Text of the file.
 * @returns The parsed value.
 */
function parseJson(_file: string, text: string): unknown {
  return JSON.parse(text)
}
