/**
 * Gives the node:test preload built for the test.
 *
 * @returns Absolute path of the built preload.
 */
export function getPreloadPath() {
  return process.env.MOOTANT_TEST_PRELOAD
}
