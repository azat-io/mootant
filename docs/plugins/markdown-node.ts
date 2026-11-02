/**
 * Node of the Markdown tree that the docs plugins change. The docs do not
 * depend on the `mdast` types, so it lists only the fields the plugins use.
 */
export interface MarkdownNode {
  data?: { hProperties?: Record<string, unknown> }
  children?: MarkdownNode[]
  depth?: number
  value?: string
  type: string
}
