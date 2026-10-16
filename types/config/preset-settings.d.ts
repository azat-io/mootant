/**
 * Settings that a preset shares with every mutator it turns on.
 */
export interface PresetSettings {
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
