import path from 'node:path'

import type { TestAdapter } from '../../types/adapter/test-adapter'
import type { RunEvent } from '../../types/run/run-event'

import { createJestReferenceArguments } from './create-jest-reference-arguments'
import { jestAdapter } from '../../adapters/jest/index'
import { classifyVerdict } from './classify-verdict'
import { runMutants } from '../../core/run-mutants'
import { createBuiltIns } from './create-built-ins'
import { describeMutant } from './describe-mutant'
import { runReference } from './run-reference'

/**
 * Runs the mutants of a fixture with mootant and by hand, where each source
 * file `src/<name>.<ext>` is reached only by `test/<name>.test.<ext>`, unless
 * the options say which test files reach it.
 *
 * @param root - Root of the copy of the fixture.
 * @param options - What differs from two workers, the default adapter and a new
 *   reference run.
 * @param options.reference - Verdicts by hand of an earlier run of the fixture.
 * @param options.testFiles - Lists the test files that reach a source file.
 * @param options.concurrency - Workers of the run, or null for the project's
 *   own.
 * @param options.adapter - What runs the mutants.
 * @param options.nodeFlags - Node flags of the run by hand, which a test script
 *   would give in `NODE_OPTIONS`.
 * @param options.jestFlags - More flags of Jest in the run by hand.
 * @param options.paths - Files to mutate.
 * @param options.parallelUnits - Whether Mootant's run asks for parallel units.
 * @param options.onProgress - Receives the events of Mootant's run.
 * @returns Mootant's run, the verdicts by hand, and a row per mutant: its
 *   description, its verdict reduced by `classifyVerdict` and its verdict by
 *   hand.
 */
export async function runJestBothWays(
  root: string,
  options: {
    reference?: Awaited<ReturnType<typeof runReference>>
    onProgress?(event: RunEvent): void
    testFiles?(file: string): string[]
    concurrency?: number | null
    parallelUnits?: boolean
    adapter?: TestAdapter
    nodeFlags?: string[]
    jestFlags?: string[]
    paths?: string[]
  } = {},
): Promise<{
  rows: { reference: string; verdict: string; mutant: string }[]
  reference: Awaited<ReturnType<typeof runReference>>
  result: Awaited<ReturnType<typeof runMutants>>
  original: boolean
}> {
  let { concurrency = 2, nodeFlags = [], jestFlags = [] } = options
  let result = await runMutants({
    builtIns: createBuiltIns('jest', options.adapter ?? jestAdapter()),
    ...(concurrency !== null && { concurrency }),
    parallelUnits: options.parallelUnits,
    paths: options.paths ?? ['src'],
    onProgress: options.onProgress,
    cache: false,
    cwd: root,
  })
  let reference =
    options.reference ??
    (await runReference(
      root,
      result.results.map(entry => entry.mutant),
      {
        testFiles:
          options.testFiles ??
          (file => {
            let extension = path.extname(file)
            return [`test/${path.basename(file, extension)}.test${extension}`]
          }),
        args: [
          ...nodeFlags,
          ...createJestReferenceArguments(root),
          ...jestFlags,
        ],
        node: process.execPath,
        timeout: 20_000,
      },
    ))
  return {
    rows: result.results.map(entry => ({
      reference: reference.verdicts.get(entry.mutant.id)!,
      verdict: classifyVerdict(entry),
      mutant: describeMutant(entry),
    })),
    original: reference.original,
    reference,
    result,
  }
}
