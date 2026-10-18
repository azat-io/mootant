import { afterEach, describe, expect, it, vi } from 'vitest'
import { writeFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { detectVitest } from '../../../adapters/vitest/detect-vitest'
import { scoreVitest } from '../../../adapters/vitest/score-vitest'

vi.mock(import('../../../adapters/vitest/detect-vitest'))

/**
 * Temporary project of the current test.
 */
let root = ''

/**
 * Creates a temporary project with the given test script.
 *
 * @param test - Command of the `test` script.
 * @returns Absolute path of the project.
 */
async function createProject(test: string): Promise<string> {
  root = await mkdtemp(path.join(tmpdir(), 'mootant-score-'))
  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({ scripts: { test } }),
  )
  return root
}

describe('scoreVitest', () => {
  afterEach(async () => {
    vi.mocked(detectVitest).mockReset()
    await rm(root, { recursive: true, force: true })
  })

  it.each([
    'vitest',
    'vitest run --coverage',
    'pnpm exec vitest run',
    'node_modules/.bin/vitest',
    'eslint . && "vitest"',
  ])('gives 2 when a test script calls Vitest: %s', async test => {
    await expect(scoreVitest(await createProject(test))).resolves.toBe(2)
    expect(detectVitest).not.toHaveBeenCalled()
  })

  it.each([
    { version: '5.0.4', score: 1 },
    { version: '4.1.0', score: 1 },
    { version: null, score: 0 },
  ])(
    'gives $score with Vitest $version installed and not called',
    async ({ version, score }) => {
      vi.mocked(detectVitest).mockResolvedValue({
        available: false,
        node: null,
        version,
      })
      let project = await createProject(
        'node --test --config vitest.config.ts @vitest/ui vitest-x',
      )

      await expect(scoreVitest(project)).resolves.toBe(score)
      expect(detectVitest).toHaveBeenCalledExactlyOnceWith(project)
    },
  )
})
