/**
 * Script of a component file that mootant parses and mutates: the text between
 * a `<script>` tag and its closing tag, or the frontmatter of an Astro file.
 */
export interface ScriptBlock {
  /**
   * Language the script is parsed as.
   */
  lang: 'tsx' | 'jsx' | 'ts' | 'js'

  /**
   * Whether the block is the frontmatter of an Astro file, which Astro runs as
   * the body of a function.
   */
  frontmatter: boolean

  /**
   * Offset of the first code unit of the script in the file.
   */
  start: number

  /**
   * Offset just past the last code unit of the script in the file.
   */
  end: number
}
