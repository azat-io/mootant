import { describe, expect, it } from 'vitest'
import { readdir } from 'node:fs/promises'
import path from 'node:path'

import type { MutantResult } from '../../../types/run/mutant-result'

import { createWorkDirectory } from '../../../core/run/create-work-directory'
import { vitestAdapter } from '../../../adapters/vitest/index'
import { runMutants } from '../../../core/run-mutants'

/**
 * Root of the fixture project, with its own Vitest configuration.
 */
let root = path.resolve(import.meta.dirname, '../../fixtures/runner')

/**
 * Summarizes a verdict for comparison.
 *
 * @param result - Verdict of a mutant.
 * @returns File, mutator, replacement and how the mutant ended.
 */
function summarize(result: MutantResult): string {
  return [
    result.mutant.file,
    result.mutant.mutator,
    result.mutant.replacement.replaceAll(/\s+/gu, ' '),
    result.status,
    result.path ?? '-',
    result.isolatedBecause ?? '-',
    result.cause ?? '-',
  ].join(' | ')
}

describe('vitest adapter', () => {
  it('runs every mutant of a project isolated by default', async () => {
    let result = await runMutants({
      builtIns: {
        vitest: {
          load: () => Promise.resolve(vitestAdapter()),
          detect: () => Promise.resolve(true),
        },
      },
      paths: ['src'],
      concurrency: 2,
      cwd: root,
    })

    expect(result.mode).toBe('isolated')
    expect(result.diagnostics).toStrictEqual([])
    // The timeout of `settle` is confirmed in a second isolated run.
    expect(result.runs).toStrictEqual({ isolated: 2, dry: 1 })
    expect(result.results.map(summarize).toSorted()).toStrictEqual(
      [
        'src/around.ts | arithmetic-operator | value / 2 | Killed | isolated | - | assertion',
        'src/around.ts | number-literal | 3 | Killed | isolated | - | assertion',
        'src/collect.ts | arithmetic-operator | value / 3 | Killed | isolated | - | hook-error',
        'src/collect.ts | number-literal | 4 | Killed | isolated | - | hook-error',
        'src/counter.ts | assignment-operator | count -= 1 | Killed | isolated | - | assertion',
        'src/counter.ts | number-literal | 1 | Survived | isolated | static | -',
        'src/counter.ts | number-literal | 2 | Survived | isolated | - | -',
        'src/counter.ts | return-value | 0 | Killed | isolated | - | assertion',
        'src/limits.ts | arithmetic-operator | 3 / 4 | Killed | isolated | static | assertion',
        'src/limits.ts | number-literal | 4 | Killed | isolated | static | assertion',
        'src/limits.ts | number-literal | 5 | Killed | isolated | static | assertion',
        'src/math.ts | arithmetic-operator | left - right | Killed | isolated | - | assertion',
        'src/math.ts | comparison-operator | value != 0 | Survived | isolated | - | -',
        'src/math.ts | comparison-operator | value > 1 | Killed | isolated | - | assertion',
        'src/math.ts | comparison-operator | value > 1 | Killed | isolated | - | assertion',
        'src/math.ts | comparison-operator | value >= 0 | Killed | isolated | - | assertion',
        'src/math.ts | comparison-operator | value >= 0 | Survived | isolated | - | -',
        'src/math.ts | number-literal | 1 | Killed | isolated | - | assertion',
        'src/math.ts | update-operator | steps-- | Killed | isolated | - | assertion',
        'src/ready.ts | boolean-literal | false | Killed | isolated | - | assertion',
        'src/ready.ts | boolean-literal | true | Survived | isolated | static | -',
        'src/ready.ts | return-value | false | Killed | isolated | - | assertion',
        'src/ready.ts | return-value | true | Survived | isolated | - | -',
        'src/ready.ts | statement-removal | ; | Killed | isolated | - | assertion',
        'src/settle.ts | condition | false | Timeout | isolated | - | time-limit',
        'src/settle.ts | condition | true | Survived | isolated | - | -',
        'src/settle.ts | missing-await | new Promise(resolve => { setTimeout(resolve, quick ? 1 : 4000) }) | Survived | isolated | - | -',
        'src/settle.ts | number-literal | 2 | Survived | isolated | - | -',
        'src/settle.ts | number-literal | 4001 | NoCoverage | - | - | -',
        "src/settle.ts | string-literal | '' | Killed | isolated | - | assertion",
      ].toSorted(),
    )
  }, 30_000)

  it('runs the mutants of a project on the batch and isolated paths in fast mode', async () => {
    let result = await runMutants({
      builtIns: {
        vitest: {
          load: () => Promise.resolve(vitestAdapter()),
          detect: () => Promise.resolve(true),
        },
      },
      paths: ['src'],
      concurrency: 2,
      fast: true,
      cwd: root,
    })

    expect(result.runner).toBe('vitest')
    expect(result.diagnostics).toStrictEqual([])
    expect(result.runs).toStrictEqual({
      confirmation: 1,
      isolated: 1,
      recovery: 1,
      batch: 1,
      dry: 1,
    })
    expect(result.results.map(summarize).toSorted()).toStrictEqual(
      [
        // An aroundEach teardown assertion fails after the try.
        'src/around.ts | arithmetic-operator | value / 2 | Killed | batch | - | assertion',
        'src/around.ts | number-literal | 3 | Killed | batch | - | assertion',
        // An afterAll assertion fails after every test passed.
        'src/collect.ts | arithmetic-operator | value / 3 | Killed | isolated | doubtful | hook-error',
        'src/collect.ts | number-literal | 4 | Killed | isolated | doubtful | hook-error',
        // A test that does not reach the mutant sees the state it left.
        'src/counter.ts | assignment-operator | count -= 1 | Killed | isolated | batch-survivor | assertion',
        'src/counter.ts | number-literal | 1 | Survived | isolated | static | -',
        'src/counter.ts | number-literal | 2 | Survived | isolated | batch-survivor | -',
        'src/counter.ts | return-value | 0 | Killed | batch | - | assertion',
        'src/limits.ts | arithmetic-operator | 3 / 4 | Killed | isolated | static | assertion',
        'src/limits.ts | number-literal | 4 | Killed | isolated | static | assertion',
        'src/limits.ts | number-literal | 5 | Killed | isolated | static | assertion',
        'src/math.ts | arithmetic-operator | left - right | Killed | batch | - | assertion',
        'src/math.ts | comparison-operator | value != 0 | Survived | isolated | batch-survivor | -',
        'src/math.ts | comparison-operator | value > 1 | Killed | batch | - | assertion',
        'src/math.ts | comparison-operator | value > 1 | Killed | batch | - | assertion',
        'src/math.ts | comparison-operator | value >= 0 | Killed | batch | - | assertion',
        'src/math.ts | comparison-operator | value >= 0 | Survived | isolated | batch-survivor | -',
        'src/math.ts | number-literal | 1 | Killed | batch | - | assertion',
        'src/math.ts | update-operator | steps-- | Killed | batch | - | assertion',
        'src/ready.ts | boolean-literal | false | Killed | batch | - | assertion',
        'src/ready.ts | boolean-literal | true | Survived | isolated | static | -',
        'src/ready.ts | return-value | false | Killed | batch | - | assertion',
        'src/ready.ts | return-value | true | Survived | isolated | batch-survivor | -',
        // The control try before it left the flag set; a fresh module did not.
        'src/ready.ts | statement-removal | ; | Killed | isolated | batch-survivor | assertion',
        'src/settle.ts | condition | false | Timeout | batch | - | time-limit',
        'src/settle.ts | condition | true | Survived | isolated | batch-survivor | -',
        'src/settle.ts | missing-await | new Promise(resolve => { setTimeout(resolve, quick ? 1 : 4000) }) | Survived | isolated | batch-survivor | -',
        'src/settle.ts | number-literal | 2 | Survived | isolated | batch-survivor | -',
        'src/settle.ts | number-literal | 4001 | NoCoverage | - | - | -',
        "src/settle.ts | string-literal | '' | Killed | batch | - | assertion",
      ].toSorted(),
    )
    await expect(readdir(root)).resolves.toStrictEqual([
      'lib',
      'src',
      'test',
      'vitest.config.ts',
    ])
  }, 30_000)

  it('reports controls, hung workers and crashes', async () => {
    let work = await createWorkDirectory()
    let session = await vitestAdapter({ config: 'vitest.config.ts' }).start({
      workDirectory: work.path,
      concurrency: 2,
      files: [],
      root,
    })
    try {
      let behavior = path.join(root, 'test/behavior.test.ts')
      let probe = path.join(root, 'test/probe.test.ts')
      let math = path.join(root, 'test/math.test.ts')

      await expect(session.listTestFiles()).resolves.toContain(probe)

      // Every test file depends on the Vitest configuration, so all of them run.
      let dry = await session.dryRun({
        related: [path.join(root, 'vitest.config.ts')],
        timeouts: { file: 60_000, test: 60_000 },
        instrumented: true,
        repeat: true,
        files: null,
      })
      let ids = new Map(dry.tests.map(test => [test.name, test.id]))

      expect(dry.files.map(file => file.file)).toContain(probe)
      expect(dry.tests.find(test => test.name === 'spins')).toMatchObject({
        tries: [
          { covers: ['spin'], failed: false, mutant: null },
          { covers: ['spin'], failed: false, mutant: null },
        ],
        file: probe,
        line: 9,
      })

      expect(dry.tests.find(test => test.name === 'snapshots')).toMatchObject({
        tries: [
          {
            message: expect.stringMatching(/snapshot/iu) as string,
            failed: true,
          },
          { failed: true },
        ],
      })
      await expect(readdir(path.join(root, 'test'))).resolves.not.toContain(
        '__snapshots__',
      )

      let limits = { load: { hitLimit: 1000, timeout: 1000 }, total: 2000 }
      let batch = await session.runBatch({
        units: [
          {
            tests: [
              {
                id: ids.get('spins')!,
                mutants: ['spin'],
                hitLimit: 1000,
                timeout: 200,
              },
            ],
            project: '',
            file: probe,
            limits,
          },
          {
            tests: [
              {
                mutants: ['fail', 'other'],
                id: ids.get('fails')!,
                hitLimit: 1000,
                timeout: 200,
              },
            ],
            project: '',
            file: probe,
            limits,
          },
          {
            tests: [
              {
                mutants: ['skip', 'after'],
                id: ids.get('skips')!,
                hitLimit: 1000,
                timeout: 200,
              },
              {
                id: ids.get('fakes timers')!,
                mutants: ['sleep', 'later'],
                hitLimit: 1000,
                timeout: 200,
              },
            ],
            file: behavior,
            project: '',
            limits,
          },
          {
            tests: [
              {
                id: ids.get('adds')!,
                mutants: ['other'],
                hitLimit: 1000,
                timeout: 200,
              },
            ],
            project: '',
            file: math,
            limits,
          },
        ],
      })

      let names = new Map(dry.tests.map(test => [test.id, test.name]))

      expect(batch.incomplete).toStrictEqual([
        { message: expect.any(String) as string, reason: 'hang', unit: 0 },
        {
          message: expect.any(String) as string,
          reason: 'abandoned',
          unit: 2,
        },
      ])
      expect(
        batch.tries.map(facts => [
          facts.unit,
          names.get(facts.test),
          facts.mutant,
          facts.failed,
          facts.timedOut,
          facts.skipped,
        ]),
      ).toStrictEqual([
        [0, 'spins', 'spin', false, true, false],
        [1, 'spins', null, false, false, false],
        [1, 'crashes', null, false, false, false],
        [1, 'fails', null, false, false, false],
        [1, 'fails', 'fail', true, false, false],
        [1, 'fails', null, false, false, false],
        [1, 'fails', 'other', false, false, false],
        [1, 'fails', null, false, false, false],
        [2, 'skips', null, false, false, false],
        [2, 'skips', 'skip', false, false, true],
        [2, 'fakes timers', null, false, false, false],
        [2, 'fakes timers', 'sleep', false, true, false],
        [3, 'adds', null, false, false, false],
        [3, 'adds', 'other', false, false, false],
        [3, 'adds', null, false, false, false],
      ])
      expect(batch.hookErrors).toStrictEqual([])

      let isolated = await session.runIsolated({
        units: [
          {
            limits: { hitLimit: 1000, timeout: 2000 },
            mutant: 'crash',
            project: '',
            file: probe,
          },
          {
            limits: { hitLimit: 1000, timeout: 2000 },
            mutant: 'fail',
            project: '',
            file: probe,
          },
        ],
      })

      expect(
        isolated.units
          .toSorted((left, right) => left.unit - right.unit)
          .map(unit => [
            unit.unit,
            unit.incomplete,
            unit.reached,
            unit.tests.map(facts => facts.failed),
          ]),
      ).toStrictEqual([
        [0, 'crash', false, [false]],
        [1, null, true, [false, false, true]],
      ])

      let hang = path.join(root, 'test/hang.test.ts')
      let hung = await session.dryRun({
        related: [path.join(root, 'lib/hang.ts')],
        timeouts: { file: 5000, test: 321 },
        instrumented: true,
        repeat: true,
        files: null,
      })

      expect(hung.hung).toStrictEqual([
        {
          test: ids.get('loops on the second call'),
          name: 'loops on the second call',
          file: hang,
        },
      ])
    } finally {
      await session.close()
      await session.close()
      await work.remove()
    }
  }, 30_000)
})
