import type { NodeTestCommand } from './types/node-test-command'

/**
 * Names of test files node:test runs by default, without extensions.
 */
const NODE_NAMES = [
  '**/*.test',
  '**/*-test',
  '**/*_test',
  '**/test-*',
  '**/test',
  '**/test/**/*',
]

/**
 * Gives the globs of the test files a tool runs when the command names none:
 * Node's own patterns for `node` and `tsx`, with TypeScript extensions when
 * types are stripped or tsx loads them; `*.test` and `*.spec` files with `.js`
 * and `.ts` for better-node-test; `*.test` files for borp, with TypeScript
 * extensions as for Node.
 *
 * @param tool - Tool of the test command.
 * @param typescript - Whether the test processes can load TypeScript.
 * @returns Globs relative to the project root.
 */
export function getDefaultPatterns(
  tool: NodeTestCommand['tool'],
  typescript: boolean,
): string[] {
  if (tool === 'bnt') {
    return ['**/*.{test,spec}.{js,ts}']
  }
  let extensions =
    typescript || tool === 'tsx' ? '{cjs,mjs,js,cts,mts,ts}' : '{cjs,mjs,js}'
  let names = tool === 'borp' ? ['**/*.test'] : NODE_NAMES
  return names.map(name => `${name}.${extensions}`)
}
