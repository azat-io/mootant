import type { Node } from 'oxc-parser'

import type { PresetSettings } from './preset-settings'
import type { SyntaxHelpers } from './syntax-helpers'
import type { SourceCode } from './source-code'
import type { TypeHints } from './type-hints'

/**
 * Everything a mutator may use while it visits one file.
 */
export interface MutatorContext<Options extends object = object> {
  /**
   * Tells whether a mutant of the mutator with the given full id that replaces
   * the node will run: the preset turned the mutator on, and no ignore
   * directive of the file covers such a mutant. Mutators use it to skip a
   * variant only while the mutant that makes it redundant will run.
   */
  isActive(id: string, node: Node): boolean

  /**
   * Settings shared by every mutator of the preset, frozen.
   */
  settings: Readonly<PresetSettings>

  /**
   * Tells whether the preset turned on the mutator with the given full id.
   */
  isEnabled(id: string): boolean

  /**
   * Options from the preset, merged over `meta.defaultOptions` and frozen.
   */
  options: Readonly<Options>

  /**
   * Text, comments and tree of the file, with helpers that locate tokens and
   * build replacement texts.
   */
  sourceCode: SourceCode

  /**
   * Questions about the syntactic position of a node.
   */
  syntax: SyntaxHelpers

  /**
   * What is known about the runtime types of expressions.
   */
  hints: TypeHints

  /**
   * Path of the file as reports print it.
   */
  file: string

  /**
   * Id of the running mutator: `name` or `plugin/name`.
   */
  id: string
}
