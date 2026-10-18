import { writeFile, mkdtemp, rm } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { getNodeCacheInputs } from '../../../adapters/node-test/get-node-cache-inputs'
import { hashEnvironment } from '../../../adapters/node-test/hash-environment'

describe('getNodeCacheInputs', () => {
  it('lists files, settings and environment hashes', async () => {
    let root = await mkdtemp(path.join(tmpdir(), 'mootant-inputs-'))
    await writeFile(path.join(root, 'tsconfig.json'), '{}')
    let environment = {
      NODE_OPTIONS: '--conditions=dev',
      NODE_ENV: 'test',
      A: '1',
    }
    let execArgv = [
      '--env-file=.env',
      '--env-file-if-exists',
      '.env.local',
      '--experimental-config-file',
      'cfg.json',
      '--env-file',
    ]
    let input = {
      setup: [path.join(root, 'setup.js')],
      set: { NODE_ENV: 'test' },
      version: 'v26.0.0',
      env: environment,
      tsx: false,
      execArgv,
      root,
    }
    let hashes = hashEnvironment(environment)

    expect(getNodeCacheInputs(input)).toStrictEqual({
      files: [
        path.join(root, 'node.config.json'),
        path.join(root, 'package.json'),
        path.join(root, 'setup.js'),
        path.join(root, '.env'),
        path.join(root, '.env.local'),
        path.join(root, 'cfg.json'),
      ],
      settings: {
        variables: [['NODE_ENV', hashes['NODE_ENV']]],
        nodeOptions: '--conditions=dev',
        env: { NODE_ENV: 'test' },
        version: 'v26.0.0',
        execArgv,
      },
      environment: { '': hashes },
    })

    let withTsx = getNodeCacheInputs({ ...input, tsx: true, env: {} })

    expect(withTsx.files).toContain(path.join(root, 'tsconfig.json'))
    expect(withTsx.settings).toMatchObject({ nodeOptions: null })

    await rm(root, { recursive: true })
  })
})
