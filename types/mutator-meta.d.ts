/**
 * Static description of a mutator.
 */
export interface MutatorMeta<Options extends object> {
  /**
   * Whether mutants of this mutator keep a solitary mutant around them, such as
   * a statement removal, from being dropped. Set it to false when killing the
   * mutants does not require observing the value or the effect of the code
   * around them, as for removing `?.`. True when omitted.
   */
  countsForSolitary?: boolean

  /**
   * Options used when a preset turns the mutator on without options. Preset
   * options are merged over them, key by key.
   */
  defaultOptions?: Options

  /**
   * One sentence naming the fault the mutator models. Reports print it next to
   * every mutant.
   */
  description: string
}
