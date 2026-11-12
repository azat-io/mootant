import path from 'node:path'

/**
 * Lists the arguments of Node for an in-band plain run of Jest.
 *
 * @param root - Root of a copy of a fixture.
 * @returns Jest's binary with its flags.
 */
export function createJestReferenceArguments(root: string): string[] {
  return [
    path.join(root, 'node_modules/jest/bin/jest.js'),
    '--ci',
    '--runInBand',
    '--no-cache',
    `--cacheDirectory=${path.join(root, 'plain-cache')}`,
    '--watchman=false',
  ]
}
