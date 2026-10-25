/**
 * Entry of the docs search index: one section of a docs page.
 */
export interface SearchDocument {
  /**
   * Titles above the section: the sidebar group, the page and, for a third
   * level heading, its second level heading.
   */
  titles: string[]

  /**
   * Heading of the section, or the page title for the text before the first
   * heading.
   */
  title: string

  /**
   * Plain text of the section.
   */
  text: string

  /**
   * Address of the section: the page and the id of its heading.
   */
  url: string
}
