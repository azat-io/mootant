import { writeFile, realpath, mkdtemp, mkdir, rm } from 'node:fs/promises'
import { afterEach, describe, expect, it } from 'vitest'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { resolveJestPackages } from '../../../adapters/jest/resolve-jest-packages'
import { createJestProject } from '../../helpers/create-jest-project'

/**
 * Packages found from `@jest/core` once the version is known, and the two found
 * from `jest-runner`, which a hoisted layout puts beside them.
 */
let loadedPackages = [
  '@jest/transform',
  'jest-haste-map',
  '@jest/console',
  'jest-resolve',
  'jest-runtime',
  'jest-runner',
  'jest-util',
]

/**
 * Temporary project of the current test.
 */
let root = ''

/**
 * Writes a package into the temporary project.
 *
 * @param name - Directory under `node_modules`.
 * @param version - What its manifest says.
 */
async function writePackage(name: string, version: string): Promise<void> {
  let directory = path.join(root, 'node_modules', name)
  await mkdir(directory, { recursive: true })
  await writeFile(
    path.join(directory, 'package.json'),
    JSON.stringify({ bin: './bin/jest.js', version, name }),
  )
}

/**
 * Creates a project with the packages found before the version is known.
 *
 * @param version - Version of `@jest/core`.
 */
async function createFakeProject(version: string): Promise<void> {
  root = await mkdtemp(path.join(tmpdir(), 'mootant-packages-'))
  await writePackage('jest', '29.0.3')
  await writePackage('jest-cli', '29.0.3')
  await writePackage('@jest/core', version)
}

describe('resolveJestPackages', () => {
  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it.each([
    { version: /^29\.7\./u, stripsTypes: false, major: 29 as const },
    { version: /^30\.5\.2$/u, major: 30 as const, stripsTypes: true },
  ])(
    'finds the packages of Jest $major from each other',
    async ({ stripsTypes, version, major }) => {
      root = await createJestProject('start', major)
      let packages = await resolveJestPackages(root)

      expect(packages.version).toMatch(version)
      expect(packages.transformVersion).toMatch(version)
      expect(packages.bin).toMatch(/\/jest\/bin\/jest\.js$/u)
      expect(packages.hasteMap).toMatch(/\/jest-haste-map$/u)
      expect(packages.console).toMatch(/\/@jest\/console$/u)
      expect(packages.resolve).toMatch(/\/jest-resolve$/u)
      expect(packages.runtime).toMatch(/\/jest-runtime$/u)
      expect(packages.runner).toMatch(/\/jest-runner$/u)
      expect(packages.util).toMatch(/\/jest-util$/u)
      expect(packages.stripsTypes).toBe(stripsTypes)
    },
  )

  it.each([
    ['29.7.0', false],
    ['30.4.1', false],
    ['30.5.1', false],
    ['30.5.2', true],
    ['30.5.10', true],
    ['30.6.0', true],
    ['31.0.0', true],
  ])(
    'reads whether @jest/transform %s strips types',
    async (version, stripsTypes) => {
      await createFakeProject('30.5.2')
      await Promise.all(
        loadedPackages.map(name =>
          writePackage(name, name === '@jest/transform' ? version : '30.5.2'),
        ),
      )

      await expect(resolveJestPackages(root)).resolves.toMatchObject({
        transformVersion: version,
        stripsTypes,
      })
    },
  )

  it('takes the version from @jest/core and the binary from jest', async () => {
    await createFakeProject('29.7.0')
    await Promise.all(loadedPackages.map(name => writePackage(name, '29.7.0')))

    await expect(resolveJestPackages(root)).resolves.toMatchObject({
      bin: expect.stringMatching(/node_modules\/jest\/bin\/jest\.js$/u),
      version: '29.7.0',
    })
  })

  it.each(['29.6.4', '28.1.3', '26.6.3'])(
    'refuses %s before it looks for the other packages',
    async version => {
      await createFakeProject(version)

      await expect(resolveJestPackages(root)).rejects.toThrow(
        `mootant runs Jest 29.7 or later, but this project has Jest ${version}.`,
      )
    },
  )

  it('finds the packages from each other and never from the root, the transformer and the console of tests from jest-runner', async () => {
    await createFakeProject('26.6.3')
    await writePackage('jest/node_modules/jest-cli', '30.0.0')
    let core = 'jest/node_modules/jest-cli/node_modules/@jest/core'
    await writePackage(core, '30.0.0')
    await Promise.all(
      loadedPackages.map(name =>
        writePackage(`${core}/node_modules/${name}`, '30.0.0'),
      ),
    )
    await Promise.all(
      ['@jest/transform', '@jest/console'].map(name =>
        writePackage(
          `${core}/node_modules/jest-runner/node_modules/${name}`,
          '30.5.2',
        ),
      ),
    )
    let found = path.join(
      await realpath(root),
      'node_modules',
      core,
      'node_modules',
    )

    await expect(resolveJestPackages(root)).resolves.toMatchObject({
      console: path.join(found, 'jest-runner/node_modules/@jest/console'),
      hasteMap: path.join(found, 'jest-haste-map'),
      resolve: path.join(found, 'jest-resolve'),
      runtime: path.join(found, 'jest-runtime'),
      runner: path.join(found, 'jest-runner'),
      util: path.join(found, 'jest-util'),
      transformVersion: '30.5.2',
      version: '30.0.0',
      stripsTypes: true,
    })
  })

  it('gives the words of Node for a broken package.json in the root', async () => {
    await createFakeProject('29.7.0')
    await writeFile(path.join(root, 'package.json'), '{ nope')

    await expect(resolveJestPackages(root)).rejects.toThrow(/package\.json/u)
  })

  it('says Jest is not installed without jest', async () => {
    root = await mkdtemp(path.join(tmpdir(), 'mootant-packages-'))

    await expect(resolveJestPackages(root)).rejects.toThrow(
      `Jest is not installed in ${root}.`,
    )
  })
})
