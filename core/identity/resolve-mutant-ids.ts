/**
 * Fewest characters of an id prefix that `--mutant` accepts.
 */
const MIN_PREFIX_LENGTH = 4

/**
 * Most candidates an ambiguous prefix names.
 */
const LISTED_CANDIDATES = 5

/**
 * Turns the ids given with `--mutant` into full ids. An id may be cut to a
 * prefix of at least four characters, as reports print it, when only one mutant
 * starts with it; a full id always matches, however short.
 *
 * @param given - Ids or id prefixes, as given.
 * @param mutants - Every listed mutant with its id and file.
 * @returns Full ids in the order given.
 * @throws Error - When a prefix is shorter than four characters, matches no
 *   mutant, or matches several, naming them.
 */
export function resolveMutantIds(
  given: readonly string[],
  mutants: readonly { file: string; id: string }[],
): string[] {
  return given.map(prefix => {
    let exact = mutants.find(mutant => mutant.id === prefix)
    if (exact !== undefined) {
      return exact.id
    }
    if (prefix.length < MIN_PREFIX_LENGTH) {
      throw new Error(
        `Mutant id "${prefix}" is too short: give at least ${MIN_PREFIX_LENGTH} characters.`,
      )
    }
    let matches = mutants.filter(mutant => mutant.id.startsWith(prefix))
    if (matches.length === 0) {
      throw new Error(`Unknown mutant id "${prefix}".`)
    }
    if (matches.length > 1) {
      let listed = matches
        .slice(0, LISTED_CANDIDATES)
        .map(mutant => `  ${mutant.id}  ${mutant.file}`)
      if (matches.length > LISTED_CANDIDATES) {
        listed.push(`  and ${matches.length - LISTED_CANDIDATES} more`)
      }
      throw new Error(
        `Mutant id "${prefix}" matches ${matches.length} mutants; give more characters:\n${listed.join('\n')}`,
      )
    }
    return matches[0]!.id
  })
}
