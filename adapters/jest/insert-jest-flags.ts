/**
 * Adds flags to Jest's arguments, before `--` when they hold one, since Jest
 * reads every word after it as a test path pattern.
 *
 * @param kept - Jest's arguments that stayed after the filter.
 * @param flags - Flags to add.
 * @returns All the words, in the order Jest gets them.
 */
export function insertJestFlags(
  kept: readonly string[],
  flags: readonly string[],
): string[] {
  let end = kept.indexOf('--')
  return end === -1 ?
      [...kept, ...flags]
    : [...kept.slice(0, end), ...flags, ...kept.slice(end)]
}
