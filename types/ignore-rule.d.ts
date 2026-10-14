import type { IgnoreSource } from './ignore-source'

/**
 * Part of a file whose mutants a directive excludes.
 */
export interface IgnoreRule {
  /**
   * Precedence class: next-line beats region, region beats file.
   */
  kind: 'next-line' | 'region' | 'file'

  /**
   * Mutator ids the rule applies to, or null for every mutator.
   */
  mutators: readonly string[] | null

  /**
   * Directive comment credited for the mutants the rule covers.
   */
  source: IgnoreSource

  /**
   * Line whose mutants a next-line rule covers; null for other kinds.
   */
  line: number | null

  /**
   * Reason given to the mutants the rule covers.
   */
  reason: string

  /**
   * Offset of the directive comment; among rules of one kind the later
   * directive wins.
   */
  order: number

  /**
   * First offset at which a covered mutant may start.
   */
  start: number

  /**
   * Offset before which a covered mutant must start.
   */
  end: number
}
