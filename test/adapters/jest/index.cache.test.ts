import {
  appendFile,
  writeFile,
  readFile,
  mkdtemp,
  mkdir,
  stat,
} from 'node:fs/promises'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { setTimeout } from 'node:timers/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { MutantResult } from '../../../types/run/mutant-result'
import type { RunResult } from '../../../types/run/run-result'

import { createDryRunRequest } from '../../helpers/create-dry-run-request'
import { createJestScope } from '../../helpers/create-jest-scope'
import { getCachePath } from '../../../core/cache/get-cache-path'
import { createBuiltIns } from '../../helpers/create-built-ins'
import { describeMutant } from '../../helpers/describe-mutant'
import { getJestMajors } from '../../helpers/get-jest-majors'
import { jestAdapter } from '../../../adapters/jest/index'
import { runMutants } from '../../../core/run-mutants'
import { findResult } from '../../helpers/find-result'

vi.mock(import('node:child_process'), async importOriginal => {
  let actual = await importOriginal()
  return { ...actual, fork: vi.fn(actual.fork) as typeof actual.fork }
})

vi.mock(
  import('../../../adapters/jest/run-on-worker'),
  async importOriginal => {
    let actual = await importOriginal()
    return { runOnWorker: vi.fn(actual.runOnWorker) }
  },
)

/**
 * Major versions of Jest of the rows that run on both, as `MOOTANT_TEST_JEST`
 * narrows them.
 */
let majors = getJestMajors()

/**
 * Copies of fixtures and sessions of the current test, which `cleanUp` ends.
 */
let {
  createCacheProject,
  clearVariables,
  createProject,
  directories,
  cleanUp,
  closes,
  start,
} = createJestScope()

/**
 * Runs the mutants of a copy of the `cache` fixture with the cache, unless the
 * options turn it off, and counts the isolated units.
 *
 * @param root - Root of the copy.
 * @param options - Whether the run uses the cache, which it does when omitted,
 *   and how many workers it has, two when omitted.
 * @param options.concurrency - Number of workers.
 * @param options.cache - Whether the run uses the cache.
 * @returns Result of the run and the isolated units it ran.
 */
async function runCached(
  root: string,
  options: { concurrency?: number; cache?: boolean } = {},
): Promise<{ result: RunResult; units: number }> {
  let units = 0
  let result = await runMutants({
    onProgress: event => {
      if (event.kind === 'run-start' && event.run === 'isolated') {
        units += event.units
      }
    },
    builtIns: createBuiltIns('jest', jestAdapter()),
    paths: ['src'],
    concurrency: 2,
    cwd: root,
    ...options,
  })
  return { result, units }
}

/**
 * Lists the files of the mutants whose verdict came from the cache, and of
 * those whose did not, without mutants nothing ran.
 *
 * @param result - Result of a run.
 * @returns Display paths of the cached and the run mutants.
 */
function splitCached(result: RunResult): { cached: string[]; ran: string[] } {
  let covered = result.results.filter(entry => entry.status !== 'NoCoverage')
  return {
    cached: [
      ...new Set(
        covered.filter(entry => entry.cached).map(entry => entry.mutant.file),
      ),
    ],
    ran: [
      ...new Set(
        covered.filter(entry => !entry.cached).map(entry => entry.mutant.file),
      ),
    ],
  }
}

/**
 * Summarizes a verdict for comparison across runs.
 *
 * @param result - Verdict of a mutant.
 * @returns File, replacement, status, path and the test of the verdict.
 */
function summarizeCachedVerdict(result: MutantResult): string {
  return [
    result.mutant.file,
    result.mutant.replacement,
    result.status,
    result.path ?? '-',
    result.killedBy ?? '-',
  ].join(' | ')
}

/**
 * Finds the verdict of the mutant with the given replacement.
 *
 * @param result - Result of a run.
 * @param replacement - Text the mutant puts in place of the code.
 * @returns Its verdict.
 */
function findReplaced(
  result: RunResult,
  replacement: string,
): MutantResult | undefined {
  return result.results.find(entry => entry.mutant.replacement === replacement)
}

/**
 * Changes a file and waits past the millisecond of the change.
 *
 * @param file - Absolute path of the file.
 * @param text - What to append, or the whole text with `replace`.
 * @param replace - Whether the text replaces what the file holds.
 */
async function changeFile(
  file: string,
  text: string,
  replace = false,
): Promise<void> {
  await (replace ? writeFile : appendFile)(file, text)
  await setTimeout(5)
}

describe('jest adapter with the cache', { timeout: 300_000 }, () => {
  beforeEach(clearVariables)

  afterEach(cleanUp)

  it('reuses every verdict of an unchanged project and runs no unit', async () => {
    let root = await createCacheProject()
    let first = await runCached(root)
    let second = await runCached(root)

    expect(first.result.cache).toBe(true)
    expect(first.result.diagnostics).toStrictEqual([])
    expect(first.result.results.some(entry => entry.cached)).toBe(false)
    expect(second.result.results.map(summarizeCachedVerdict)).toStrictEqual(
      first.result.results.map(summarizeCachedVerdict),
    )
    expect(splitCached(second.result)).toStrictEqual({
      cached: ['src/limit.js', 'src/size.js'],
      ran: [],
    })
    expect(second.result.runs).toStrictEqual({ dry: 1 })
    expect(second.units).toBe(0)
  })

  it.each<[string, string, (root: string) => Promise<void>]>([
    [
      'probes a missing file',
      "existsSync(path.join(__dirname, 'src.ts'))",
      () => Promise.resolve(),
    ],
    [
      'reads a file',
      "readFileSync(path.join(__dirname, 'shared.json'))",
      root => writeFile(path.join(root, 'shared.json'), '{}\n'),
    ],
  ])(
    'reuses every verdict of an unchanged project whose transformer %s only while the disk cache of Jest lacks the module',
    async (_name, read, prepare) => {
      let root = await createCacheProject()
      let transformer = path.join(root, 'transform.js')
      await prepare(root)
      await writeFile(
        transformer,
        (await readFile(transformer, 'utf8'))
          .replace(
            "let { readFileSync } = require('node:fs')",
            "let { existsSync, readFileSync } = require('node:fs')",
          )
          .replace(
            '    readOptions()\n    return { code }',
            `    readOptions()\n    ${read}\n    return { code }`,
          ),
      )
      await setTimeout(5)
      await runCached(root)
      let second = await runCached(root)

      expect(splitCached(second.result)).toStrictEqual({
        cached: ['src/limit.js', 'src/size.js'],
        ran: [],
      })
      expect(second.units).toBe(0)
    },
  )

  it('runs the mutants of a changed source again, and the units of the test files that load it', async () => {
    let root = await createCacheProject()
    await runCached(root)
    await changeFile(path.join(root, 'src/limit.js'), '\nexports.unused = 1\n')
    let { result } = await runCached(root)
    let size = result.results.filter(
      entry => entry.mutant.file === 'src/size.js',
    )
    let survivors = size.filter(entry => entry.status === 'Survived')
    let kills = size.filter(
      entry => entry.killedIn?.endsWith('size.test.js') === true,
    )

    expect(
      result.results
        .filter(entry => entry.mutant.file === 'src/limit.js')
        .some(entry => entry.cached),
    ).toBe(false)
    expect(survivors.length).toBeGreaterThan(0)
    expect(kills.length).toBeGreaterThan(0)
    // Their other test file loads the changed file, so only that unit runs.
    expect(survivors.every(entry => !entry.cached && entry.tries === 1)).toBe(
      true,
    )
    expect(kills.every(entry => entry.cached)).toBe(true)
  })

  it('runs only the units of a changed test file again', async () => {
    let root = await createCacheProject()
    let first = await runCached(root)
    await changeFile(path.join(root, 'test/limit.test.js'), '// changed\n')
    let second = await runCached(root)
    let survivors = second.result.results.filter(
      entry => entry.status === 'Survived',
    )

    expect(second.result.results.map(summarizeCachedVerdict)).toStrictEqual(
      first.result.results.map(summarizeCachedVerdict),
    )
    expect(survivors.length).toBeGreaterThan(0)
    for (let survivor of survivors) {
      expect(survivor).toMatchObject({ cached: false, tries: 1 })
    }
    expect(findReplaced(second.result, 'value / 2')).toMatchObject({
      status: 'Killed',
      cached: true,
      tries: 0,
    })
    expect(second.units).toBeLessThan(first.units)
  })

  it('runs the units of a test file again when its snapshot changes', async () => {
    let root = await createCacheProject()
    await runCached(root)
    await changeFile(
      path.join(root, 'test/__snapshots__/size.test.js.snap'),
      '// changed\n',
    )
    let { result } = await runCached(root)

    expect(findReplaced(result, 'value / 2')).toMatchObject({
      status: 'Killed',
      cached: false,
    })
    expect(findReplaced(result, 'Math.max(value, 100)')).toMatchObject({
      status: 'Killed',
      cached: true,
    })
  })

  it('runs every mutant again when the Jest configuration, a setup file, the transformer or a Babel configuration changes', async () => {
    let root = await createCacheProject()
    await runCached(root)
    let all = ['src/limit.js', 'src/size.js']
    let changes: [string, string, boolean][] = [
      ['jest.config.js', '// changed\n', false],
      ['test/setup.js', '// changed\n', false],
      ['transform.js', '// changed\n', false],
      ['babel.config.js', 'module.exports = {}\n', true],
    ]
    await changes.reduce(async (previous, [file, text, replace]) => {
      await previous
      await changeFile(path.join(root, file), text, replace)
      let { result } = await runCached(root)

      expect({ ...splitCached(result), file }).toStrictEqual({
        cached: [],
        ran: all,
        file,
      })
    }, Promise.resolve())
    let { result } = await runCached(root)

    expect(splitCached(result)).toStrictEqual({ cached: all, ran: [] })
  })

  it('runs every mutant again when a file the transformer reads once in a worker changes, which a later unit of the worker never reads', async () => {
    let root = await createCacheProject()
    await runCached(root, { concurrency: 1 })
    await changeFile(
      path.join(root, 'transform.json'),
      '{ "kept": false }\n',
      true,
    )
    let { result } = await runCached(root, { concurrency: 1 })

    expect(splitCached(result)).toStrictEqual({
      ran: ['src/limit.js', 'src/size.js'],
      cached: [],
    })
  })

  it.each<[string, (file: string) => Promise<void>]>([
    ['changes', file => writeFile(file, '0\n')],
    ['appears', () => Promise.resolve()],
  ])(
    'runs every mutant again when a file the transformer looks for in a module only mutants load %s, which a later unit of the worker never reads',
    async (_name, prepare) => {
      let root = await createCacheProject()
      let config = path.join(root, 'jest.config.js')
      await writeFile(
        config,
        (await readFile(config, 'utf8')).replace(
          'transform: {',
          () => String.raw`transform: { 'extra\\.js$': '<rootDir>/inline.js',`,
        ),
      )
      await writeFile(
        path.join(root, 'inline.js'),
        `let { createHash } = require('node:crypto')
let { existsSync, readFileSync } = require('node:fs')
let path = require('node:path')

function readValue(file) {
  let found = path.join(path.dirname(file), 'extra.json')
  return existsSync(found) ? readFileSync(found, 'utf8') : '0'
}

module.exports = {
  getCacheKey(code, file) {
    return createHash('sha1').update(code).update(readValue(file)).digest('hex')
  },
  process(code, file) {
    return { code: code.replace('VALUE', readValue(file).trim()) }
  },
}
`,
      )
      await mkdir(path.join(root, 'lib'))
      await writeFile(
        path.join(root, 'lib/extra.js'),
        'module.exports = VALUE\n',
      )
      await prepare(path.join(root, 'lib/extra.json'))
      await writeFile(
        path.join(root, 'src/pick.js'),
        "exports.first = flag => (flag ? require('../lib/extra') : 0)\n\nexports.second = flag => (flag ? require('../lib/extra') : 0)\n",
      )
      await writeFile(
        path.join(root, 'test/pick.test.js'),
        "let { first, second } = require('../src/pick')\n\ntest('falls back', () => {\n  expect(first(false) + second(false)).toBe(0)\n})\n",
      )
      await setTimeout(5)

      /**
       * Lists the verdicts of the mutants that load the module.
       *
       * @param result - Result of a run.
       * @returns Status of each and whether it came from the cache.
       */
      function readForced(result: RunResult): [string, boolean][] {
        return result.results
          .filter(
            entry => describeMutant(entry) === 'src/pick.js | condition | true',
          )
          .map(entry => [entry.status, entry.cached])
      }

      let first = await runCached(root, { concurrency: 1 })
      await changeFile(path.join(root, 'lib/extra.json'), '1\n', true)
      let { result } = await runCached(root, { concurrency: 1 })

      expect(readForced(first.result)).toStrictEqual([
        ['Survived', false],
        ['Survived', false],
      ])
      expect(readForced(result)).toStrictEqual([
        ['Killed', false],
        ['Killed', false],
      ])
      expect(splitCached(result)).toStrictEqual({
        ran: ['src/limit.js', 'src/pick.js', 'src/size.js'],
        cached: [],
      })
    },
  )

  it.each<[string, string]>([
    [
      'in each call',
      `let { readFileSync } = require('node:fs')
let path = require('node:path')

module.exports = (request, options) => {
  if (request !== '@fallback') {
    return options.defaultResolver(request, options)
  }
  let routes = JSON.parse(
    readFileSync(path.join(__dirname, 'routing.json'), 'utf8'),
  )
  return path.join(options.rootDir, routes.fallback)
}
`,
    ],
    [
      'as it loads',
      `let { readFileSync } = require('node:fs')
let path = require('node:path')

let routes = JSON.parse(
  readFileSync(path.join(__dirname, 'routing.json'), 'utf8'),
)

module.exports = (request, options) =>
  request === '@fallback' ?
    path.join(options.rootDir, routes.fallback)
  : options.defaultResolver(request, options)
`,
    ],
  ])(
    'runs a mutant again when a file the resolver of the project reads %s changes, by which it resolves a module only that mutant loads',
    async (_name, resolver) => {
      let root = await createCacheProject()
      let config = path.join(root, 'jest.config.js')
      await writeFile(
        config,
        (await readFile(config, 'utf8')).replace(
          'setupFiles:',
          () => "resolver: '<rootDir>/resolver.js',\n  setupFiles:",
        ),
      )
      await writeFile(path.join(root, 'resolver.js'), resolver)
      await writeFile(
        path.join(root, 'routing.json'),
        '{ "fallback": "lib/one.js" }\n',
      )
      await mkdir(path.join(root, 'lib'))
      await writeFile(path.join(root, 'lib/one.js'), 'module.exports = 1\n')
      await writeFile(path.join(root, 'lib/zero.js'), 'module.exports = 0\n')
      await writeFile(
        path.join(root, 'src/pick.js'),
        "exports.pick = flag => (flag ? require('@fallback') : 0)\n",
      )
      await writeFile(
        path.join(root, 'test/pick.test.js'),
        "let { pick } = require('../src/pick')\n\ntest('falls back', () => {\n  expect(pick(false)).toBe(0)\n})\n",
      )
      await setTimeout(5)
      let forced = 'src/pick.js | condition | true'
      let first = await runCached(root, { concurrency: 1 })
      await changeFile(
        path.join(root, 'routing.json'),
        '{ "fallback": "lib/zero.js" }\n',
        true,
      )
      let second = await runCached(root, { concurrency: 1 })
      let third = await runCached(root, { concurrency: 1 })

      expect(findResult(first.result.results, forced)).toMatchObject({
        status: 'Killed',
        cached: false,
      })
      expect(findResult(second.result.results, forced)).toMatchObject({
        status: 'Survived',
        cached: false,
      })
      expect(third.units).toBe(0)
    },
  )

  it.each(majors)(
    'runs a mutant again when a file appears that the resolver of the project looks for to choose a module only that mutant loads, past what Jest %i resolves for it',
    async major => {
      let root = await createProject('cache', major)
      let config = path.join(root, 'jest.config.js')
      await writeFile(
        config,
        (await readFile(config, 'utf8')).replace(
          'setupFiles:',
          () => "resolver: '<rootDir>/resolver.js',\n  setupFiles:",
        ),
      )
      await writeFile(
        path.join(root, 'resolver.js'),
        `let { existsSync } = require('node:fs')
let path = require('node:path')

module.exports = (request, options) => {
  if (request !== '@fallback') {
    return options.defaultResolver(request, options)
  }
  let chosen = existsSync(path.join(options.rootDir, 'use-new.flag'))
  return path.join(options.rootDir, chosen ? 'lib/zero.js' : 'lib/one.js')
}
`,
      )
      await mkdir(path.join(root, 'lib'))
      await writeFile(path.join(root, 'lib/one.js'), 'module.exports = 1\n')
      await writeFile(path.join(root, 'lib/zero.js'), 'module.exports = 0\n')
      await writeFile(
        path.join(root, 'src/pick.js'),
        "exports.pick = flag => (flag ? require('@fallback') : 0)\n",
      )
      await writeFile(
        path.join(root, 'test/pick.test.js'),
        "let { pick } = require('../src/pick')\n\ntest('falls back', () => {\n  expect(pick(false)).toBe(0)\n})\n",
      )
      await setTimeout(5)
      let forced = 'src/pick.js | condition | true'
      let first = await runCached(root, { concurrency: 1 })
      await changeFile(path.join(root, 'use-new.flag'), '', true)
      let second = await runCached(root, { concurrency: 1 })
      let third = await runCached(root, { concurrency: 1 })

      expect(findResult(first.result.results, forced)).toMatchObject({
        status: 'Killed',
        cached: false,
      })
      expect(findResult(second.result.results, forced)).toMatchObject({
        status: 'Survived',
        cached: false,
      })
      expect(third.units).toBe(0)
    },
  )

  it.skipIf(!majors.includes(29))(
    'runs a mutant again when a file appears that a packageFilter of the resolver of the project looks for, which Jest 29 calls inside its default resolver',
    async () => {
      let root = await createProject('cache', 29)
      let config = path.join(root, 'jest.config.js')
      await writeFile(
        config,
        (await readFile(config, 'utf8')).replace(
          'setupFiles:',
          () => "resolver: '<rootDir>/resolver.js',\n  setupFiles:",
        ),
      )
      await writeFile(
        path.join(root, 'resolver.js'),
        `let { existsSync } = require('node:fs')
let path = require('node:path')

module.exports = (request, options) =>
  options.defaultResolver(request, {
    ...options,
    packageFilter: manifest => {
      if (manifest.name !== 'fallback') {
        return manifest
      }
      let chosen = existsSync(path.join(options.rootDir, 'use-new.flag'))
      return { ...manifest, main: chosen ? 'zero.js' : 'one.js' }
    },
  })
`,
      )
      let fallback = path.join(root, 'node_modules/fallback')
      await mkdir(fallback)
      await writeFile(
        path.join(fallback, 'package.json'),
        '{ "name": "fallback" }\n',
      )
      await writeFile(path.join(fallback, 'one.js'), 'module.exports = 1\n')
      await writeFile(path.join(fallback, 'zero.js'), 'module.exports = 0\n')
      await writeFile(
        path.join(root, 'src/pick.js'),
        "exports.pick = flag => (flag ? require('fallback') : 0)\n",
      )
      await writeFile(
        path.join(root, 'test/pick.test.js'),
        "let { pick } = require('../src/pick')\n\ntest('falls back', () => {\n  expect(pick(false)).toBe(0)\n})\n",
      )
      await setTimeout(5)
      let forced = 'src/pick.js | condition | true'
      let first = await runCached(root, { concurrency: 1 })
      await changeFile(path.join(root, 'use-new.flag'), '', true)
      let second = await runCached(root, { concurrency: 1 })

      expect(findResult(first.result.results, forced)).toMatchObject({
        status: 'Killed',
        cached: false,
      })
      expect(findResult(second.result.results, forced)).toMatchObject({
        status: 'Survived',
        cached: false,
      })
    },
  )

  it.each(majors)(
    'runs again every mutant that loads a module an asynchronous resolver of the project chose by a file it read after an await, when that file changes, on Jest %i',
    async major => {
      let root = await createProject('esm', major)
      let config = path.join(root, 'jest.config.js')
      await writeFile(
        config,
        (await readFile(config, 'utf8')).replace(
          'transform: {},',
          () => "transform: {},\n  resolver: '<rootDir>/resolver.js',",
        ),
      )
      await writeFile(
        path.join(root, 'resolver.js'),
        `let { readFileSync } = require('node:fs')
let path = require('node:path')

module.exports = {
  async: async (request, options) => {
    if (request !== '@fallback') {
      return options.defaultResolver(request, options)
    }
    await new Promise(resolve => {
      setTimeout(resolve, 1)
    })
    let routes = JSON.parse(
      readFileSync(path.join(options.rootDir, 'routing.json'), 'utf8'),
    )
    return path.join(options.rootDir, routes.fallback)
  },
  sync: (request, options) => options.defaultResolver(request, options),
}
`,
      )
      await writeFile(
        path.join(root, 'routing.json'),
        '{ "fallback": "lib/one.mjs" }\n',
      )
      await mkdir(path.join(root, 'lib'))
      await writeFile(path.join(root, 'lib/one.mjs'), 'export default 1\n')
      await writeFile(path.join(root, 'lib/zero.mjs'), 'export default 0\n')
      await writeFile(
        path.join(root, 'src/pick.mjs'),
        "export let first = async flag => (flag ? (await import('@fallback')).default : 0)\n\nexport let second = async flag => (flag ? (await import('@fallback')).default : 0)\n",
      )
      await writeFile(
        path.join(root, 'test/pick.test.mjs'),
        "import { first, second } from '../src/pick.mjs'\n\ntest('falls back', async () => {\n  expect((await first(false)) + (await second(false))).toBe(0)\n})\n",
      )
      await setTimeout(5)

      /**
       * Lists the verdicts of the mutants that load the module.
       *
       * @param result - Result of a run.
       * @returns Status of each and whether it came from the cache.
       */
      function readForced(result: RunResult): [string, boolean][] {
        return result.results
          .filter(
            entry =>
              describeMutant(entry) === 'src/pick.mjs | condition | true',
          )
          .map(entry => [entry.status, entry.cached])
      }

      let first = await runCached(root, { concurrency: 1 })
      await changeFile(
        path.join(root, 'routing.json'),
        '{ "fallback": "lib/zero.mjs" }\n',
        true,
      )
      let second = await runCached(root, { concurrency: 1 })
      let third = await runCached(root, { concurrency: 1 })

      expect(readForced(first.result)).toStrictEqual([
        ['Killed', false],
        ['Killed', false],
      ])
      expect(readForced(second.result)).toStrictEqual([
        ['Survived', false],
        ['Survived', false],
      ])
      expect(third.units).toBe(0)
    },
  )

  it.each<[string, string]>([
    [
      'as it loads',
      `let { readFileSync } = require('node:fs')
let path = require('node:path')
let { TestEnvironment } = require('jest-environment-jsdom')

let policy = readFileSync(path.join(__dirname, 'policy.json'), 'utf8')

module.exports = class extends TestEnvironment {
  constructor(config, context) {
    super(config, context)
    this.global.policy = JSON.parse(policy)
  }
}
`,
    ],
    [
      'in its setup, once in a worker',
      `let { readFileSync } = require('node:fs')
let path = require('node:path')
let { TestEnvironment } = require('jest-environment-jsdom')

let policy

module.exports = class extends TestEnvironment {
  async setup() {
    await super.setup()
    policy ??= readFileSync(path.join(__dirname, 'policy.json'), 'utf8')
    this.global.policy = JSON.parse(policy)
  }
}
`,
    ],
    [
      'in its event handler, once in a worker',
      `let { readFileSync } = require('node:fs')
let path = require('node:path')
let { TestEnvironment } = require('jest-environment-jsdom')

let policy

module.exports = class extends TestEnvironment {
  async handleTestEvent(event) {
    if (event.name === 'test_start') {
      policy ??= readFileSync(path.join(__dirname, 'policy.json'), 'utf8')
      this.global.policy = JSON.parse(policy)
    }
  }
}
`,
    ],
  ])(
    'runs every mutant again when a file the test environment reads %s changes, which a later unit of the worker never reads',
    async (_name, environment) => {
      let root = await createCacheProject()
      let config = path.join(root, 'jest.config.js')
      await writeFile(
        config,
        (await readFile(config, 'utf8')).replace(
          "testEnvironment: 'node'",
          "testEnvironment: '<rootDir>/environment.js'",
        ),
      )
      await writeFile(path.join(root, 'policy.json'), '{ "strict": false }\n')
      await writeFile(
        path.join(root, 'src/half.js'),
        'exports.half = value => value / 2\n',
      )
      await writeFile(
        path.join(root, 'test/half.test.js'),
        "let { half } = require('../src/half')\n\ntest('halves', () => {\n  expect(half(4)).toBe(2)\n})\n",
      )
      await writeFile(path.join(root, 'environment.js'), environment)
      await setTimeout(5)
      await runCached(root, { concurrency: 1 })
      await changeFile(
        path.join(root, 'policy.json'),
        '{ "strict": true }\n',
        true,
      )
      let { result } = await runCached(root, { concurrency: 1 })

      expect(splitCached(result)).toStrictEqual({
        ran: ['src/half.js', 'src/limit.js', 'src/size.js'],
        cached: [],
      })
    },
  )

  it('keeps what a setup file queued with the reads of the test file, under a test environment of the project', async () => {
    let root = await createCacheProject()
    let config = path.join(root, 'jest.config.js')
    await writeFile(
      config,
      (await readFile(config, 'utf8')).replace(
        "testEnvironment: 'node'",
        "testEnvironment: '<rootDir>/environment.js'",
      ),
    )
    await writeFile(
      path.join(root, 'environment.js'),
      "let { TestEnvironment } = require('jest-environment-jsdom')\n\nmodule.exports = class extends TestEnvironment {}\n",
    )
    await writeFile(
      path.join(root, 'test/setup.js'),
      "globalThis.setUp = true\n\nvoid Promise.resolve().then(() => require('../src/clock'))\n",
    )
    await writeFile(
      path.join(root, 'src/clock.js'),
      'exports.tick = value => value + 1\n',
    )
    await writeFile(
      path.join(root, 'test/clock.test.js'),
      "let { tick } = require('../src/clock')\n\ntest('ticks', () => {\n  expect(tick(1)).toBe(2)\n})\n",
    )
    await setTimeout(5)
    let { result } = await runCached(root, { cache: false })

    expect(
      result.results
        .filter(entry => entry.mutant.file === 'src/clock.js')
        .map(entry => entry.status),
    ).not.toContain('NoCoverage')
  })

  it('runs the mutants of a test file again when a variable changes that a child process it started got from the worker', async () => {
    let root = await createCacheProject()
    await writeFile(
      path.join(root, 'src/half.js'),
      'exports.half = value => value / 2\n',
    )
    await writeFile(
      path.join(root, 'test/half.test.js'),
      "let { execFileSync } = require('node:child_process')\nlet { half } = require('../src/half')\n\ntest('halves, with a child', () => {\n  execFileSync(process.execPath, ['-e', '0'])\n  expect(half(4)).toBe(2)\n})\n",
    )
    await setTimeout(5)
    await runCached(root)
    vi.stubEnv('CHILD_PROBE', '1')
    let { result } = await runCached(root)

    expect(splitCached(result)).toStrictEqual({
      cached: ['src/limit.js', 'src/size.js'],
      ran: ['src/half.js'],
    })
  })

  it('runs every mutant again when a variable changes, once a preload made a promisified execFile that tests start children with, which no wrapper sees', async () => {
    let root = await createCacheProject()
    let preload = path.join(root, 'preload.cjs')
    await writeFile(
      preload,
      "let { execFile } = require('node:child_process')\nlet { promisify } = require('node:util')\n\nglobalThis.execFileAsync = promisify(execFile)\n",
    )
    await writeFile(
      path.join(root, 'src/half.js'),
      'exports.half = value => value / 2\n',
    )
    await writeFile(
      path.join(root, 'test/half.test.js'),
      "let { half } = require('../src/half')\n\ntest('halves, with a child', async () => {\n  await execFileAsync(process.execPath, ['-e', '0'])\n  expect(half(4)).toBe(2)\n})\n",
    )
    vi.stubEnv('NODE_OPTIONS', `--require ${preload}`)
    await setTimeout(5)
    await runCached(root)
    vi.stubEnv('CHILD_PROBE', '1')
    let { result } = await runCached(root)

    expect(splitCached(result)).toStrictEqual({
      ran: ['src/half.js', 'src/limit.js', 'src/size.js'],
      cached: [],
    })
  })

  it('runs the mutants of a file again when what it reads through a URL of the test environment changes', async () => {
    let root = await createCacheProject()
    let config = path.join(root, 'jest.config.js')
    await writeFile(
      config,
      (await readFile(config, 'utf8')).replace(
        "testEnvironment: 'node'",
        "testEnvironment: 'jsdom'",
      ),
    )
    await writeFile(path.join(root, 'src/gate.json'), '1\n')
    await writeFile(
      path.join(root, 'src/gate.js'),
      "let { readFileSync } = require('node:fs')\n\nexports.open = () =>\n  Number(readFileSync(new URL('file://' + __dirname + '/gate.json'), 'utf8')) >= 0\n",
    )
    await writeFile(
      path.join(root, 'test/gate.test.js'),
      "let { open } = require('../src/gate')\n\ntest('opens', () => {\n  expect(open()).toBe(true)\n})\n",
    )
    await setTimeout(5)
    await runCached(root)
    await changeFile(path.join(root, 'src/gate.json'), '0\n', true)
    let { result } = await runCached(root)

    expect(splitCached(result)).toStrictEqual({
      cached: ['src/limit.js', 'src/size.js'],
      ran: ['src/gate.js'],
    })
  })

  it('gives a test file the same dependencies whichever file ran before it on its worker, on Jest 29 too, whose resolver reads what it probes', async () => {
    let root = await createProject('cache', 29)
    let files = ['test/limit.test.js', 'test/size.test.js'].map(file => ({
      file: path.join(root, file),
      project: '',
    }))

    /**
     * Starts a session with one worker and runs one dry run of the files in the
     * given order.
     *
     * @param order - Test files in the order they run.
     * @returns The dependencies of each test file, sorted by the file.
     */
    async function readDependencies(
      order: typeof files,
    ): Promise<[string, undefined | string[] | null][]> {
      let workDirectory = await mkdtemp(path.join(tmpdir(), 'mootant-work-'))
      directories.push(workDirectory)
      let session = await jestAdapter().start({
        concurrency: 1,
        workDirectory,
        files: [],
        root,
      })
      closes.push(session.close)
      let dry = await session.dryRun(createDryRunRequest({ files: order }))
      return dry.files.map(entry => [entry.file, entry.dependencies])
    }

    let first = await readDependencies(files)
    let second = await readDependencies(files.toReversed())

    expect(second).toStrictEqual(first)
    expect(first.map(([file]) => file)).toStrictEqual(
      files.map(({ file }) => file),
    )
  })

  it('runs the units of the test file that reads a changed variable again, nothing for one no test reads, and everything for a verdict variable', async () => {
    let root = await createCacheProject()
    vi.stubEnv('CACHE_UNREAD', 'a')
    vi.stubEnv('CACHE_READ', 'a')
    vi.stubEnv('TZ', 'Europe/Berlin')
    let first = await runCached(root)
    let unchanged = await runCached(root)

    expect(first.result.diagnostics).toStrictEqual([])
    expect(splitCached(unchanged.result).ran).toStrictEqual([])

    vi.stubEnv('CACHE_UNREAD', 'b')
    let unread = await runCached(root)

    expect(splitCached(unread.result).ran).toStrictEqual([])

    vi.stubEnv('CACHE_READ', 'b')
    let read = await runCached(root)

    expect(
      read.result.results
        .filter(entry => entry.mutant.file === 'src/limit.js')
        .every(entry => !entry.cached),
    ).toBe(true)
    expect(findReplaced(read.result, 'value / 2')).toMatchObject({
      status: 'Killed',
      cached: true,
    })
    expect(read.units).toBeGreaterThan(0)
    expect(read.units).toBeLessThan(first.units)

    vi.stubEnv('TZ', 'Asia/Tokyo')
    let zone = await runCached(root)

    expect(splitCached(zone.result)).toStrictEqual({
      ran: ['src/limit.js', 'src/size.js'],
      cached: [],
    })
  })

  it('runs the mutants again when the configuration the host ran with changes, though what --showConfig gave stays', async () => {
    let root = await createCacheProject()
    let config = path.join(root, 'jest.config.js')
    await writeFile(
      config,
      (await readFile(config, 'utf8')).replace(
        "testEnvironment: 'node',",
        () =>
          "testEnvironment: 'node',\n  globals: {\n    CHECK_RESULTS:\n      !process.argv.includes('--showConfig') &&\n      process.env.STRICT_ASSERTIONS === '1',\n  },",
      ),
    )
    await writeFile(
      path.join(root, 'src/triple.js'),
      'exports.triple = value => value * 3\n',
    )
    await writeFile(
      path.join(root, 'test/triple.test.js'),
      "let { triple } = require('../src/triple')\n\ntest('triples, checked when the run asks', () => {\n  let result = triple(2)\n  if (CHECK_RESULTS) {\n    expect(result).toBe(6)\n  }\n})\n",
    )
    await setTimeout(5)
    let mutant = 'src/triple.js | arithmetic-operator | value / 3'
    let first = await runCached(root)
    vi.stubEnv('STRICT_ASSERTIONS', '1')
    let second = await runCached(root)

    expect(findResult(first.result.results, mutant)).toMatchObject({
      status: 'Survived',
    })
    expect(findResult(second.result.results, mutant)).toMatchObject({
      status: 'Killed',
      cached: false,
    })
  })

  it('keeps the transforms of an unchanged project in the cache of Jest from one session to the next, for a transformer that keys them by the configuration', async () => {
    let root = await createCacheProject()
    let config = path.join(root, 'jest.config.js')
    let log = path.join(root, 'processed.log')
    await writeFile(
      config,
      (await readFile(config, 'utf8')).replace(
        "'<rootDir>/transform.js'",
        () => "'<rootDir>/count.js'",
      ),
    )
    await writeFile(
      path.join(root, 'count.js'),
      "let { appendFileSync } = require('node:fs')\nlet path = require('node:path')\n\nmodule.exports = {\n  process(code, file) {\n    appendFileSync(path.join(__dirname, 'processed.log'), path.basename(file) + '\\n')\n    return { code }\n  },\n}\n",
    )
    await setTimeout(5)
    await runCached(root, { cache: false })
    let first = await readFile(log, 'utf8')
    await runCached(root, { cache: false })

    expect(first).not.toBe('')
    await expect(readFile(log, 'utf8')).resolves.toBe(first)
  })

  it('keeps the cache of a test that writes back a file it reads', async () => {
    let root = await createCacheProject()
    let file = path.join(root, 'test/state.json')
    let before = await stat(file)
    let text = await readFile(file, 'utf8')
    await runCached(root)
    let after = await stat(file)
    let second = await runCached(root)

    expect(after.mtimeMs).toBeGreaterThan(before.mtimeMs)
    await expect(readFile(file, 'utf8')).resolves.toBe(text)
    expect(splitCached(second.result)).toStrictEqual({
      cached: ['src/limit.js', 'src/size.js'],
      ran: [],
    })
    expect(second.units).toBe(0)
  })

  it('neither reads nor writes the cache when it is off', async () => {
    let root = await createCacheProject()
    let file = getCachePath(root)
    await runCached(root)
    let saved = await readFile(file, 'utf8')
    let { result } = await runCached(root, { cache: false })

    expect(result.cache).toBe(false)
    expect(result.results.some(entry => entry.cached)).toBe(false)
    await expect(readFile(file, 'utf8')).resolves.toBe(saved)
  })

  it('keeps what differs from one session to another out of the cache inputs and the dependencies', async () => {
    let root = await createCacheProject()
    let files = ['test/limit.test.js', 'test/size.test.js'].map(file => ({
      file: path.join(root, file),
      project: '',
    }))

    /**
     * Starts a session, runs one dry run and reads its cache inputs, as the
     * core does.
     *
     * @returns The settings, files and dependencies of each test file.
     */
    async function readSession(): Promise<unknown[]> {
      let { session } = await start(root)
      let dry = await session.dryRun(createDryRunRequest({ files }))
      let inputs = await session.cacheInputs!()
      await session.close()
      return [
        inputs.settings,
        inputs.files,
        dry.files.map(entry => entry.dependencies),
      ]
    }

    let first = await readSession()
    let second = await readSession()

    expect(second).toStrictEqual(first)
    expect(JSON.stringify(first)).not.toContain('mootant-work-')
    expect(first[1]).toContain(path.join(root, 'transform.json'))
    expect(first[2]).toStrictEqual([
      expect.arrayContaining([
        path.join(root, 'src/limit.js'),
        path.join(root, 'test/state.json'),
        path.join(root, 'test/__snapshots__/limit.test.js.snap'),
      ]),
      expect.arrayContaining([
        path.join(root, 'test/__snapshots__/size.test.js.snap'),
        path.join(root, 'package.json'),
      ]),
    ])
  })
})
