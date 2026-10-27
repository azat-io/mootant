import type { MutantResult } from '../../types/run/mutant-result'
import type { TryFacts } from '../../types/adapter/try-facts'
import type { RunResult } from '../../types/run/run-result'
import type { DryTest } from '../../types/adapter/dry-test'
import type { Mutant } from '../../types/mutant/mutant'

import { createMutant } from './create-mutant'

/**
 * Project root of the run.
 */
const ROOT = '/repo'

/**
 * Text of the mutated file `src/cart.ts`.
 */
const SOURCE = [
  "export let unit = 'cm'",
  'export let limit = 10',
  'export function fits(size) {',
  '  return size < limit',
  '}',
  'export let ratio = 2 * 3',
  '// mootant-ignore-next-line: shown elsewhere',
  'export let scale = 4 - 1',
  '',
].join('\n')

/**
 * Builds the result of a fast-mode run on one file, `src/cart.ts`, with a
 * mutant of every status: a batch kill, a static timeout, a survivor covered by
 * two tests of one file with a second file that reached it while loading, a
 * mutant without coverage, one without a verdict, and an ignored one.
 *
 * @returns Result of the run; a fresh object on every call.
 */
export function createRunResult(): RunResult {
  let killed = createCartMutant('killed000001', "'cm'", {
    mutator: 'string-literal',
    replacement: "''",
  })
  let timeout = createCartMutant('timeout00001', '10', {
    mutator: 'number-literal',
    replacement: '11',
  })
  let survived = createCartMutant('survived0001', 'size < limit', {
    mutator: 'comparison-operator',
    replacement: 'size <= limit',
  })
  let uncovered = createCartMutant('uncovered001', '2 * 3', {
    replacement: '2 / 3',
  })
  let errored = createCartMutant('errored00001', 'size < limit', {
    mutator: 'conditional',
    replacement: 'true',
  })
  let ignored = createCartMutant('ignored00001', '4 - 1', {
    ignoredBy: {
      directive: 'mootant-ignore-next-line',
      column: 4,
      line: 7,
    },
    reason: 'shown elsewhere',
    replacement: '4 + 1',
    status: 'Ignored',
  })
  let mutants = [killed, timeout, survived, errored, uncovered, ignored]
  return {
    results: [
      createVerdict(killed, {
        testFiles: [`${ROOT}/test/cart.test.ts`],
        killedIn: `${ROOT}/test/cart.test.ts`,
        message: "expected '' to be 'cm'",
        coveredBy: ['cart-unit'],
        killedBy: 'cart-unit',
        cause: 'assertion',
        status: 'Killed',
      }),
      createVerdict(timeout, {
        killedIn: `${ROOT}/test/limit.test.ts`,
        isolatedBecause: 'static',
        cause: 'time-limit',
        status: 'Timeout',
        path: 'isolated',
        duration: 250.4,
      }),
      createVerdict(survived, {
        testFiles: [`${ROOT}/test/cart.test.ts`, `${ROOT}/test/other.test.ts`],
        coveredBy: ['fits-small', 'cart-unit'],
        isolatedBecause: 'batch-survivor',
        status: 'Survived',
        path: 'isolated',
      }),
      createVerdict(errored, {
        message: 'Tries of test/cart.test.ts went missing twice.',
        testFiles: [`${ROOT}/test/cart.test.ts`],
        isolatedBecause: 'recovery',
        coveredBy: ['fits-small'],
        path: 'isolated',
        status: 'Error',
      }),
      createVerdict(uncovered, { status: 'NoCoverage', path: null }),
      createVerdict(ignored, { status: 'Ignored', duration: 0, path: null }),
    ],
    mutators: [
      ['string-literal', 'Empties a string literal.'],
      ['number-literal', 'Changes a number literal.'],
      ['comparison-operator', 'Changes a comparison operator.'],
      ['conditional', 'Replaces a condition with true or false.'],
      ['arithmetic-operator', 'Swaps an arithmetic operator.'],
    ].map(([id, description], rank) => ({
      mutator: { meta: { description: description! }, create: () => ({}) },
      options: {},
      id: id!,
      rank,
    })),
    tests: [
      createDryTest('fits-small', {
        tries: [
          createDryTry('fits-small', { duration: 2.2 }),
          createDryTry('fits-small', { duration: 7.6, failed: true }),
        ],
        name: 'fits > small sizes',
        line: 12,
      }),
      createDryTest('cart-unit', { name: 'cart > unit', line: 4 }),
      createDryTest('unused', { file: `${ROOT}/test/other.test.ts` }),
    ],
    diagnostics: [
      {
        message: 'pool "threads" changed to "forks".',
        code: 'config-overridden',
        severity: 'warning',
        column: null,
        file: null,
        line: null,
      },
    ],
    files: [
      {
        absolute: `${ROOT}/src/cart.ts`,
        file: 'src/cart.ts',
        diagnostics: [],
        source: SOURCE,
        parsed: true,
        skipped: [],
        mutants,
      },
    ],
    timing: {
      startup: 210.2,
      isolated: 700,
      dryRun: 190,
      total: 1300,
      batch: 200,
    },
    staticCost: [
      { file: 'src/cart.ts', duration: 600.4, mutants: 1, units: 2 },
    ],
    listedIds: mutants.map(mutant => mutant.id),
    runs: { isolated: 2, batch: 2, dry: 1 },
    unrepeatable: ['fits-small'],
    runnerVersion: '5.0.4',
    preset: 'recommended',
    runner: 'vitest',
    threshold: null,
    cache: false,
    mode: 'fast',
    since: null,
    html: null,
    root: ROOT,
  }
}

/**
 * Builds the verdict of a mutant.
 *
 * @param mutant - Mutant the verdict is about.
 * @param fields - Fields that differ from a kill of the batch path.
 * @returns Verdict with every field set.
 */
function createVerdict(
  mutant: Mutant,
  fields: Partial<MutantResult>,
): MutantResult {
  return {
    isolatedBecause: null,
    status: 'Killed',
    killedBy: null,
    killedIn: null,
    coveredBy: [],
    testFiles: [],
    message: null,
    path: 'batch',
    cached: false,
    duration: 1.6,
    cause: null,
    tries: 1,
    mutant,
    ...fields,
  }
}

/**
 * Builds the facts of a dry try.
 *
 * @param test - Id of the test.
 * @param fields - Facts that differ from a passing try of 4.4 ms.
 * @returns Facts of the try.
 */
function createDryTry(test: string, fields: Partial<TryFacts> = {}): TryFacts {
  return {
    timedOut: false,
    skipped: false,
    reached: false,
    duration: 4.4,
    failed: false,
    message: null,
    mutant: null,
    covers: [],
    strays: [],
    hits: 0,
    test,
    ...fields,
  }
}

/**
 * Builds a mutant of `src/cart.ts` that replaces the first occurrence of a
 * fragment.
 *
 * @param id - Its id.
 * @param fragment - Text it replaces.
 * @param fields - Other fields that differ from the defaults.
 * @returns Mutant with every field set.
 */
function createCartMutant(
  id: string,
  fragment: string,
  fields: Partial<Mutant>,
): Mutant {
  let start = SOURCE.indexOf(fragment)
  return createMutant({
    end: start + fragment.length,
    file: 'src/cart.ts',
    start,
    id,
    ...fields,
  })
}

/**
 * Builds a dry-run test of the project.
 *
 * @param id - Its id, also its name.
 * @param fields - Fields that differ from the defaults: a test of
 *   `test/cart.test.ts` named after its id, on no line, with two passing
 *   tries.
 * @returns Test with its tries.
 */
function createDryTest(id: string, fields: Partial<DryTest> = {}): DryTest {
  return {
    tries: [createDryTry(id), createDryTry(id)],
    file: `${ROOT}/test/cart.test.ts`,
    project: '',
    line: null,
    name: id,
    id,
    ...fields,
  }
}
