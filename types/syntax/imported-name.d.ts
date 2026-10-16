/**
 * What a name declared by an import declaration refers to.
 */
export interface ImportedName {
  /**
   * Module specifier of the import declaration.
   */
  source: string

  /**
   * Exported name the import reads: the imported name of a named import,
   * `default` for a default import and `*` for a namespace import.
   */
  name: string
}
