/**
 * Source file with every mutant hosted. Plain data, so adapters whose
 * transforms run in other processes can serialize it.
 */
export interface SwitchedFile {
  /**
   * Text mootant read and listed mutants from.
   */
  original: string

  /**
   * Text with all mutants hosted.
   */
  switched: string

  /**
   * Real absolute path of the file.
   */
  file: string
}
