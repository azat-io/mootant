import {
  writeFile,
  realpath,
  symlink,
  mkdtemp,
  mkdir,
  rm,
} from 'node:fs/promises'
import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { JestProjectConfig } from '../../../adapters/jest/types/jest-project-config'

import { listJestTestFiles } from '../../../adapters/jest/list-jest-test-files'

/**
 * Temporary project of the current test.
 */
let root = ''

/**
 * Creates a project configuration with no file outside `node_modules`.
 *
 * @param config - What differs from the default.
 * @returns A kept project.
 */
function createProject(config: Partial<JestProjectConfig>): {
  config: JestProjectConfig
  name: string
} {
  return {
    config: {
      testEnvironment: '/p/node_modules/jest-environment-node/index.js',
      runner: '/p/node_modules/jest-runner/build/index.js',
      testRunner: '/p/node_modules/jest-circus/runner.js',
      moduleFileExtensions: ['js'],
      transformIgnorePatterns: [],
      snapshotSerializers: [],
      setupFilesAfterEnv: [],
      setupFiles: [],
      rootDir: root,
      roots: [root],
      transform: [],
      id: 'kept',
      ...config,
    },
    name: '',
  }
}

describe('listJestTestFiles', () => {
  beforeEach(async () => {
    root = await realpath(await mkdtemp(path.join(tmpdir(), 'mootant-files-')))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('lists test files, configured files and mocks of the kept projects by real path, each once', async () => {
    await mkdir(path.join(root, 'real'))
    await mkdir(path.join(root, '__mocks__'))
    await writeFile(path.join(root, 'real/a.test.js'), '')
    await writeFile(path.join(root, 'setup.js'), '')
    await writeFile(path.join(root, '__mocks__/fake.js'), '')
    await symlink(path.join(root, 'real'), path.join(root, 'link'))

    let files = await listJestTestFiles({
      ready: {
        moduleMaps: {
          kept: { mocks: [['fake', '__mocks__/fake.js']], rootDir: root },
          skipped: { mocks: [['lint', 'lint.js']], rootDir: root },
        },
        tests: [
          { path: path.join(root, 'link/a.test.js'), project: 'kept' },
          { path: path.join(root, 'real/a.test.js'), project: 'kept' },
        ],
        globalConfig: {
          detectOpenHandles: false,
          testSequencer: '/s.js',
          maxWorkers: 1,
        },
        type: 'ready',
        umask: 0o022,
        configs: {},
        loaded: [],
        cwd: root,
        env: {},
      },
      globalConfig: {
        testSequencer: '/p/node_modules/@jest/test-sequencer/index.js',
        detectOpenHandles: false,
        maxWorkers: 1,
      },
      projects: [
        createProject({ setupFiles: [path.join(root, 'setup.js')] }),
        createProject({ id: 'no-tests' }),
      ],
    })

    expect(files).toStrictEqual([
      path.join(root, '__mocks__/fake.js'),
      path.join(root, 'real/a.test.js'),
      path.join(root, 'setup.js'),
    ])
  })
})
