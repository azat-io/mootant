import { describe, expect, it } from 'vitest'

import type { AdapterSession } from '../../../types/adapter/adapter-session'
import type { DryRunResult } from '../../../types/adapter/dry-run-result'
import type { ProjectTree } from '../../../types/cache/project-tree'
import type { Diagnostic } from '../../../types/mutant/diagnostic'
import type { DryFile } from '../../../types/adapter/dry-file'

import { listVariableHashes } from '../../../core/cache/list-variable-hashes'
import { createDrySnapshot } from '../../../core/cache/create-dry-snapshot'
import { CACHE_VERSION } from '../../../core/cache/cache-version'

/**
 * Warning of a session that started.
 */
let warning: Diagnostic = {
  message: 'a setting was changed',
  code: 'config-overridden',
  severity: 'warning',
  column: null,
  file: null,
  line: null,
}

/**
 * Builds a saved dry run of a run whose two test files have keys.
 *
 * @param changes - What differs from that run.
 * @param changes.keyed - Test files with a key; both by default.
 * @param changes.runs - Runs of the dry phase; 1 by default.
 * @param changes.session - Session of the run.
 * @param changes.tree - Project tree; one whose hash is `tree` by default.
 * @returns The saved dry run, or null.
 */
function create(
  changes: {
    tree?: ProjectTree | null
    session?: AdapterSession
    keyed?: string[]
    runs?: number
  } = {},
): ReturnType<typeof createDrySnapshot> {
  let dry: DryRunResult = {
    files: [
      createFile('/p/b.test.ts', {
        dependencies: ['/p/src/b.ts', '/p/helper.ts'],
      }),
      createFile('/p/a.test.ts', {
        dependencies: ['/p/helper.ts'],
        environment: ['MODE', 'PWD'],
      }),
    ],
    mismatched: [],
    outside: [],
    served: [],
    tests: [],
    hung: [],
  }
  let dependencies = new Map([
    ['/p/b.test.ts', ['/p/b.test.ts', '/p/src/b.ts', '/p/helper.ts']],
    ['/p/a.test.ts', ['/p/a.test.ts', '/p/helper.ts']],
  ])
  let keyed = new Set(changes.keyed ?? dependencies.keys())
  return createDrySnapshot({
    cache: {
      hashes: new Map([
        ['/p/package.json', 'hp'],
        ['/p/b.test.ts', 'hb'],
        ['/p/a.test.ts', 'ha'],
        ['/p/helper.ts', 'hh'],
        ['/p/src/b.ts', 'hs'],
      ]),
      dependencies: new Map(
        [...dependencies].filter(([file]) => keyed.has(file)),
      ),
      inputs: new Map([['i1', { environment: [['OLDPWD', 'h1']], files: [] }]]),
      pending: new Map([['s1', { environment: [['SHLVL', null]], files: [] }]]),
      environment: ['/p/package.json', '/p/vitest.config.ts'],
    } as never,
    session:
      changes.session ??
      ({
        diagnostics: [warning],
        version: '5.0.0',
        workers: 3,
      } as never),
    phase: {
      errors: new Map([['src/c.ts', 'broken']]),
      runs: changes.runs ?? 1,
      diagnostics: [],
      dry,
    },
    tree:
      changes.tree === undefined ?
        { entries: new Map(), hash: 'tree' }
      : changes.tree,
    inputs: { files: ['/p/vitest.config.ts'], settings: { pool: 'forks' } },
    environment: { HOME: '/home', MODE: 'test', PWD: '/p' },
    testFiles: ['/p/a.test.ts', '/p/b.test.ts'],
    key: 'key',
  })
}

/**
 * Builds a test file of a dry run.
 *
 * @param file - Absolute path of the test file.
 * @param fields - Fields that differ from a file that read nothing.
 * @returns The test file.
 */
function createFile(file: string, fields: Partial<DryFile> = {}): DryFile {
  return {
    loadFailed: false,
    concurrent: false,
    loadDuration: 1,
    hookDuration: 0,
    project: '',
    covers: [],
    errors: [],
    hits: 0,
    file,
    ...fields,
  }
}

describe('createDrySnapshot', () => {
  it('saves the dry phase, the session, every file the keys took in and the variables tests read, in the dry run or in cached units', () => {
    let snapshot = create()

    expect(snapshot).toStrictEqual({
      files: [
        ['/p/a.test.ts', 'ha'],
        ['/p/b.test.ts', 'hb'],
        ['/p/helper.ts', 'hh'],
        ['/p/package.json', 'hp'],
        ['/p/src/b.ts', 'hs'],
        ['/p/vitest.config.ts', null],
      ],
      session: {
        inputs: { files: ['/p/vitest.config.ts'], settings: { pool: 'forks' } },
        diagnostics: [warning],
        version: '5.0.0',
        workers: 3,
      },
      phase: {
        dry: expect.objectContaining({ mismatched: [] }) as never,
        errors: [['src/c.ts', 'broken']],
        diagnostics: [],
      },
      variables: listVariableHashes(['MODE', 'PWD', 'OLDPWD', 'SHLVL'], {
        HOME: '/home',
        MODE: 'test',
        PWD: '/p',
      }),
      testFiles: ['/p/a.test.ts', '/p/b.test.ts'],
      version: CACHE_VERSION,
      tree: 'tree',
      key: 'key',
    })
    expect(snapshot!.variables.map(([name]) => name)).toStrictEqual([
      '*',
      'MODE',
      'OLDPWD',
      'PWD',
      'SHLVL',
    ])
  })

  it('leaves out what a session does not tell', () => {
    expect(
      create({ session: { listTestFiles: () => [] } as never })!.session,
    ).toStrictEqual({
      inputs: { files: ['/p/vitest.config.ts'], settings: { pool: 'forks' } },
      diagnostics: [],
      version: null,
      workers: null,
    })
  })

  it('saves nothing when a test file has no key, the dry phase ran the tests again or the tree has no hash', () => {
    expect(create({ keyed: ['/p/a.test.ts'] })).toBeNull()
    expect(create({ runs: 2 })).toBeNull()
    expect(create({ tree: null })).toBeNull()
  })
})
