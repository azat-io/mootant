import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { JestProjectConfig } from '../../../adapters/jest/types/jest-project-config'
import type { JestModuleMap } from '../../../adapters/jest/types/jest-module-map'

import { writeWorkerSession } from '../../../adapters/jest/write-worker-session'

/**
 * Temporary directory of the current test.
 */
let directory = ''

describe('writeWorkerSession', () => {
  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'mootant-session-'))
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('writes the kept projects that have test files, and what the reads of a unit count in every kept project', async () => {
    let packages = {
      transformVersion: '30.0.0',
      console: '/console',
      resolve: '/resolve',
      runtime: '/runtime',
      stripsTypes: false,
      hasteMap: '/haste',
      runner: '/runner',
      version: '30.0.0',
      util: '/util',
      bin: '/bin',
    }
    let globalConfig = {
      detectOpenHandles: false,
      testSequencer: '/s.js',
      maxWorkers: 2,
    }
    let moduleMap: JestModuleMap = { rootDir: '/p', mocks: [] }
    let config = {
      moduleFileExtensions: ['js', 'json'],
      roots: ['/p/src', '/shared'],
      rootDir: '/p',
      id: 'kept',
    } as JestProjectConfig
    let file = await writeWorkerSession({
      ready: {
        tests: [
          { path: '/p/a.test.js', project: 'kept' },
          { path: '/p/b.test.js', project: 'other' },
          { path: '/p/c.test.js', project: 'kept' },
        ],
        moduleMaps: { skipped: moduleMap, kept: moduleMap },
        configs: { kept: config },
        type: 'ready',
        globalConfig,
        umask: 0o027,
        loaded: [],
        cwd: '/p',
        env: {},
      },
      projects: [
        { name: 'kept', config },
        {
          config: {
            ...config,
            moduleFileExtensions: ['ts', 'js'],
            rootDir: '/elsewhere',
            roots: ['/p/other'],
            id: 'no-tests',
          },
          name: 'no-tests',
        },
      ],
      globalConfig,
      root: '/p',
      directory,
      packages,
    })

    expect(file).toBe(path.join(directory, 'session.json'))
    expect(JSON.parse(await readFile(file, 'utf8'))).toStrictEqual({
      reads: {
        directories: ['/p', '/p/src', '/shared', '/elsewhere', '/p/other'],
        extensions: ['js', 'json', 'ts', 'snap'],
      },
      projects: [
        {
          id: 'kept',
          moduleMap,
          config,
        },
      ],
      umask: 0o027,
      globalConfig,
      packages,
    })
  })
})
