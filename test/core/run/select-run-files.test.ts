import { describe, expect, it } from 'vitest'
import path from 'node:path'

import type { FileMutants } from '../../../types/mutant/file-mutants'

import { selectRunFiles } from '../../../core/run/select-run-files'

/**
 * Directory of mootant's package in the tests.
 */
const PACKAGE = path.resolve('/mootant')

/**
 * Builds a listed file without mutants.
 *
 * @param absolute - Absolute path.
 * @param file - Display path.
 * @returns Listed file.
 */
function createFile(absolute: string, file: string): FileMutants {
  return {
    diagnostics: [],
    parsed: true,
    skipped: [],
    mutants: [],
    source: '',
    absolute,
    file,
  }
}

describe('selectRunFiles', () => {
  it('leaves out test files, Astro components and the worker runtime', () => {
    let kept = createFile(path.resolve('/project/src/a.ts'), 'src/a.ts')
    let vue = createFile(path.resolve('/project/src/Card.vue'), 'src/Card.vue')
    let svelte = createFile(
      path.resolve('/project/src/Card.svelte'),
      'src/Card.svelte',
    )
    let own = createFile(
      path.join(PACKAGE, 'core/run/plan-batch.ts'),
      'core/run/plan-batch.ts',
    )
    let result = selectRunFiles(
      [
        kept,
        createFile(path.resolve('/project/src/a.test.ts'), 'src/a.test.ts'),
        vue,
        svelte,
        createFile(path.resolve('/project/src/Card.astro'), 'src/Card.astro'),
        createFile(
          path.join(PACKAGE, 'core/runtime/index.ts'),
          'core/runtime/index.ts',
        ),
        createFile(
          path.join(PACKAGE, 'adapters/vitest/worker/claim-unit.ts'),
          'adapters/vitest/worker/claim-unit.ts',
        ),
        createFile(
          path.join(PACKAGE, 'dist/adapters/vitest/runner.js'),
          'dist/adapters/vitest/runner.js',
        ),
        own,
      ],
      [path.resolve('/project/src/a.test.ts')],
      PACKAGE,
    )

    expect(result.files).toStrictEqual([kept, vue, svelte, own])
    expect(
      result.diagnostics.map(({ message, code }) => [code, message]),
    ).toStrictEqual([
      [
        'test-file-excluded',
        'src/a.test.ts is a test or setup file; mootant run does not mutate it.',
      ],
      [
        'unsupported-file',
        'src/Card.astro is an Astro component; mootant run does not run Astro components yet.',
      ],
      [
        'self-runtime-file',
        "core/runtime/index.ts is part of mootant's worker runtime; a switched copy would call itself.",
      ],
      ['self-runtime-file', expect.stringContaining('claim-unit.ts')],
      ['self-runtime-file', expect.stringContaining('runner.js')],
    ])
    expect(result.diagnostics[0]).toMatchObject({
      file: 'src/a.test.ts',
      severity: 'warning',
      column: null,
      line: null,
    })
  })
})
