/**
 * Settings that a preset shares with every mutator it turns on.
 */
export interface PresetSettings {
  /**
   * Names of the loggers, such as `['console', 'logger', '*Logger']`: a
   * receiver whose log methods write log entries, or a bare function, such as
   * `log`, whose call with a text first does. A name matches in any letter
   * case; a leading `*` matches any prefix before the rest as written. The
   * mutants of the message texts of their log calls are skipped, and so is the
   * removal of a global `console` call whose arguments are only such texts. A
   * message text is a string, or a template whose `${}` hold only identifiers,
   * as an argument or a `+` operand; before other arguments, only one that
   * surely holds no format directive, such as `%j`. Other mutants of a log call
   * are kept, such as `name.trim()` → `name` or the removal of
   * `logger.info('Saved')`, and the labels of their child-logger factories are
   * not mutated. A name left out is ordinary code. Empty unless a preset or the
   * configuration sets it; a later value replaces an earlier one.
   */
  loggers: readonly string[]

  /**
   * Whether coarse mutants, such as a removed statement, are kept when a finer
   * mutant lies inside them. A finer mutant does not prove that a test sees
   * what the coarse one erases: with `state` already false, a test kills the
   * flip of `setEnabled(state, false)` but not the removed call. False unless a
   * preset turns it on, and then the solitary rule drops such coarse mutants.
   */
  coarseMutants: boolean

  /**
   * Whether the expressions of Svelte and Vue templates are mutated, when the
   * `svelte` or `@vue/compiler-dom` package can be loaded. True unless a preset
   * or the configuration turns it off.
   */
  templates: boolean

  /**
   * Whether mutants that only a timeout can kill are emitted, such as a loop
   * test forced to `true`. False unless a preset turns it on.
   */
  timeouts: boolean
}
