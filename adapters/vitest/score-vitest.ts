import type { DetectionScore } from '../../types/adapter/built-in-adapters'

import { readTestScripts } from '../shared/read-test-scripts'
import { detectVitest } from './detect-vitest'

/**
 * Word `vitest` as a command in a script: alone or as the last segment of a
 * path, such as in `vitest run`, `pnpm exec vitest` or
 * `node_modules/.bin/vitest`, but not in `vitest.config.ts` or `@vitest/ui`.
 */
const VITEST_COMMAND = /(?:^|[\s"&'(/;|])vitest(?=$|[\s"&');|])/u

/**
 * Tells how surely a project runs its tests with Vitest: a script it runs its
 * tests with calls Vitest (2), Vitest is installed in any version (1), or
 * neither (0). Starting the session reports a version mootant does not support
 * or a Vitest that is missing.
 *
 * @param root - Project root.
 * @returns Score of the detection.
 */
export async function scoreVitest(root: string): Promise<DetectionScore> {
  let scripts = await readTestScripts(root)
  if (scripts.some(command => VITEST_COMMAND.test(command))) {
    return 2
  }
  return (await detectVitest(root)).version === null ? 0 : 1
}
