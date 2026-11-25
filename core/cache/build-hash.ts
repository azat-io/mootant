/**
 * Hash of the code of mootant's build, which the build writes in place of this
 * text (`vite.config.ts`), so a reinstall of the same package keeps the cache
 * keys and a build of other code under the same version changes them. Sources
 * keep this text, and `getBuildId` gives them an id of their own. Pass it on
 * only as a value: the build may inline a constant that code compares and fold
 * the comparison before the hash is written.
 */
export const BUILD_HASH: string = '__MOOTANT_BUILD_HASH__'
