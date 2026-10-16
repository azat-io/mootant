/**
 * Component file whose template is read.
 */
export interface TemplateSource {
  /**
   * Language of the template expressions: TypeScript when a script block of the
   * component is.
   */
  lang: 'js' | 'ts'

  /**
   * Text of the file.
   */
  source: string

  /**
   * Path of the file as reports print it.
   */
  file: string
}
