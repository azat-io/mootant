import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import { writeFile, realpath, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { listJestConfigFiles } from '../../../adapters/jest/list-jest-config-files'

/* Cspell:words babelignore browserslistrc swcrc */

/**
 * Root of the temporary project of the current test.
 */
let root = ''

/**
 * Lists the files of the transformers and Browserslist in a directory.
 *
 * @param directory - Absolute path of the directory.
 * @returns Their absolute paths, in the order of the lister.
 */
function listTransformFiles(directory: string): string[] {
  return [
    'babel.config.js',
    'babel.config.cjs',
    'babel.config.mjs',
    'babel.config.json',
    'babel.config.cts',
    'babel.config.ts',
    'babel.config.mts',
    '.babelrc',
    '.babelrc.js',
    '.babelrc.cjs',
    '.babelrc.mjs',
    '.babelrc.json',
    '.babelrc.cts',
    '.babelignore',
    '.swcrc',
    '.browserslistrc',
    'browserslist',
  ].map(name => path.join(directory, name))
}

/**
 * Lists the configuration files Jest looks for in the root.
 *
 * @returns Their absolute paths, in the order of the lister.
 */
function listJestFiles(): string[] {
  return [
    'jest.config.js',
    'jest.config.ts',
    'jest.config.mjs',
    'jest.config.mts',
    'jest.config.cjs',
    'jest.config.cts',
    'jest.config.json',
  ].map(name => path.join(root, name))
}

describe('listJestConfigFiles', () => {
  beforeEach(async () => {
    root = await realpath(
      await mkdtemp(path.join(tmpdir(), 'mootant-configs-')),
    )
    await writeFile(path.join(root, 'tsconfig.json'), '{}')
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('lists every configuration file Jest looks for in the root, and those of the transformers in the root and each project, missing ones included', () => {
    let project = path.join(root, 'packages/a')

    expect(
      listJestConfigFiles({ directories: [root, project], args: [], root }),
    ).toStrictEqual([
      ...listJestFiles(),
      ...listTransformFiles(root),
      path.join(root, 'tsconfig.json'),
      ...listTransformFiles(project),
      path.join(project, 'tsconfig.json'),
      path.join(root, 'packages/tsconfig.json'),
    ])
  })

  it.each([
    [['-c', 'jest/unit.js']],
    [['--config', 'jest/unit.js']],
    [['--config=jest/unit.js']],
    [['-c=jest/unit.js']],
    [['--c', 'jest/unit.js']],
    [['--config', 'other.js', '--ci', '-c', 'jest/unit.js']],
    [['--config', 'jest/unit.js', '--', '--config', 'other.js']],
  ])(
    'lists the configuration file the command %j gives in place of those Jest looks for',
    arguments_ => {
      expect(
        listJestConfigFiles({ args: arguments_, directories: [], root }),
      ).toStrictEqual([
        path.join(root, 'jest/unit.js'),
        ...listTransformFiles(root),
        path.join(root, 'tsconfig.json'),
      ])
    },
  )

  it('lists the configuration files Jest looks for when the flag that names one has no value', () => {
    expect(
      listJestConfigFiles({ args: ['--ci', '-c'], directories: [], root }),
    ).toStrictEqual([
      ...listJestFiles(),
      ...listTransformFiles(root),
      path.join(root, 'tsconfig.json'),
    ])
  })

  it('lists no configuration file of Jest for one given as JSON', () => {
    expect(
      listJestConfigFiles({
        args: ['--config', '{"testEnvironment":\n"node"}'],
        directories: [],
        root,
      }),
    ).toStrictEqual([
      ...listTransformFiles(root),
      path.join(root, 'tsconfig.json'),
    ])
  })

  it('lists what a tsconfig.json extends', async () => {
    await writeFile(
      path.join(root, 'tsconfig.json'),
      '{ "extends": "./tsconfig.base.json" }',
    )
    await writeFile(path.join(root, 'tsconfig.base.json'), '{}')

    expect(
      listJestConfigFiles({ directories: [], args: [], root }).slice(-2),
    ).toStrictEqual([
      path.join(root, 'tsconfig.json'),
      path.join(root, 'tsconfig.base.json'),
    ])
  })
})
