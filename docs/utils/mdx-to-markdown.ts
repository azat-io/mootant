import { readFile } from 'node:fs/promises'
import remarkParse from 'remark-parse'
import remarkMdx from 'remark-mdx'
import { unified } from 'unified'
import path from 'node:path'

/**
 * Writes the Markdown of an element of an MDX page.
 */
export type MdxRenderer = (element: MdxElement) => Promise<string> | string

/**
 * Node of the tree that `remark-mdx` parses. It lists only the fields that the
 * conversion uses.
 */
interface MdxNode {
  /**
   * Offsets of the node in the source of the page.
   */
  position?: {
    start: { offset?: number }
    end: { offset?: number }
  }

  /**
   * Program of an `import` block or of an expression in braces.
   */
  data?: { estree?: { body: EstreeStatement[] } }

  /**
   * Attributes of an element.
   */
  attributes?: MdxAttribute[]

  /**
   * Nodes inside the node.
   */
  children?: MdxNode[]

  /**
   * Name of an element, such as `Card` or `details`.
   */
  name?: string | null

  /**
   * Kind of the node, such as `paragraph` or `mdxJsxFlowElement`.
   */
  type: string
}

/**
 * What the conversion of one page needs.
 */
interface Context {
  /**
   * Renderers of the elements by name.
   */
  renderers: Record<string, MdxRenderer | undefined>

  /**
   * Values of the default imports by local name: the text of the file for a
   * `?raw` import, the path of the module otherwise.
   */
  imports: Map<string, string>

  /**
   * Body of the page, which the offsets of the nodes point into.
   */
  source: string

  /**
   * Path of the page, for imports and errors.
   */
  file: string
}

/**
 * Attribute of an element. A value in braces is an expression.
 */
interface MdxAttribute {
  /**
   * Text of the value, an expression in braces, or null without a value.
   */
  value?: { value: string } | string | null

  /**
   * Name of the attribute. A spread has none.
   */
  name?: string

  /**
   * Kind of the attribute: `mdxJsxAttribute` or a spread.
   */
  type: string
}

/**
 * Element of an MDX page as its renderer gets it.
 */
interface MdxElement {
  /**
   * Attributes of the element. An attribute that names an import holds the text
   * of the file for a `?raw` import and the path of the module otherwise.
   */
  props: Record<string, string>

  /**
   * Markdown of each child of the element.
   */
  children: string[]
}

/**
 * Statement of an `import` or `export` block.
 */
interface EstreeStatement {
  /**
   * Names that an `import` declares.
   */
  specifiers?: { local: { name: string } }[]

  /**
   * Module that an `import` reads.
   */
  source?: { value: unknown }

  /**
   * Kind of the statement, such as `ImportDeclaration`.
   */
  type: string
}

/**
 * Nodes of MDX syntax, which the Markdown of the page cannot keep as written.
 */
const MDX_TYPES = new Set([
  'mdxJsxFlowElement',
  'mdxJsxTextElement',
  'mdxFlowExpression',
  'mdxTextExpression',
  'mdxjsEsm',
])

/**
 * Nodes that stand on lines of their own. The children of an element that has
 * none of them are inline, such as text and code.
 */
const BLOCK_TYPES = new Set([
  'mdxJsxFlowElement',
  'mdxFlowExpression',
  'thematicBreak',
  'blockquote',
  'definition',
  'paragraph',
  'mdxjsEsm',
  'heading',
  'table',
  'list',
  'code',
  'html',
])

/**
 * Turns the body of an MDX page into Markdown. The Markdown of the page stays
 * as written, imports go away and every element, a component or an HTML tag,
 * takes the Markdown of its renderer. An element without a renderer stops the
 * build, so a new component cannot vanish from the Markdown unnoticed.
 *
 * @param source - Body of the page without its frontmatter.
 * @param file - Path of the page, which its imports are relative to.
 * @param renderers - Renderers of the elements by name.
 * @returns Markdown of the page.
 */
export async function mdxToMarkdown(
  source: string,
  file: string,
  renderers: Record<string, MdxRenderer | undefined>,
): Promise<string> {
  let tree = unified().use(remarkParse).use(remarkMdx).parse(source) as MdxNode
  let nodes = tree.children ?? []
  let context: Context = {
    imports: await readImports(nodes, file),
    renderers,
    source,
    file,
  }
  let blocks = await Promise.all(nodes.map(node => renderNode(node, context)))
  return `${blocks.filter(Boolean).join('\n\n').trim()}\n`
}

/**
 * Reads the default imports of a page. A `?raw` import gives the text of its
 * file, any other import the path of its module.
 *
 * @param nodes - Top level nodes of the page.
 * @param file - Path of the page.
 * @returns Values of the imports by local name.
 */
async function readImports(
  nodes: MdxNode[],
  file: string,
): Promise<Map<string, string>> {
  let statements = nodes
    .filter(node => node.type === 'mdxjsEsm')
    .flatMap(node => node.data?.estree?.body ?? [])
    .filter(statement => statement.type === 'ImportDeclaration')
  let imports = await Promise.all(
    statements.flatMap(({ specifiers = [], source }) =>
      specifiers.map(async ({ local }) => {
        let specifier = String(source?.value)
        let value =
          specifier.endsWith('?raw') ?
            await readFile(
              path.resolve(path.dirname(file), specifier.slice(0, -4)),
              'utf8',
            )
          : specifier
        return [local.name, value] as const
      }),
    ),
  )
  return new Map(imports)
}

/**
 * Writes the Markdown of the children of an element. Inline children make one
 * text, as written between the tags, and each block child gives its own.
 *
 * @param node - Element with the children.
 * @param context - Page of the element.
 * @returns Markdown of each child that has any.
 */
async function renderChildren(
  node: MdxNode,
  context: Context,
): Promise<string[]> {
  let children = node.children ?? []
  let first = children.at(0)
  let last = children.at(-1)
  if (first && last && children.every(child => !BLOCK_TYPES.has(child.type))) {
    let text = await renderRange(
      {
        start: first.position?.start.offset ?? 0,
        end: last.position?.end.offset ?? 0,
      },
      children.flatMap(child =>
        MDX_TYPES.has(child.type) ? [child] : findMdxNodes(child),
      ),
      context,
    )
    return [text]
  }
  let blocks = await Promise.all(
    children.map(child => renderNode(child, context)),
  )
  return blocks.filter(Boolean)
}

/**
 * Writes the Markdown of a node: the source of a Markdown node with the MDX
 * inside it converted, or the Markdown of an MDX node.
 *
 * @param node - Node to write.
 * @param context - Page of the node.
 * @returns Markdown of the node.
 */
async function renderNode(node: MdxNode, context: Context): Promise<string> {
  switch (node.type) {
    case 'mdxJsxFlowElement':
    case 'mdxJsxTextElement':
      return renderElement(node, context)
    case 'mdxFlowExpression':
    case 'mdxTextExpression':
      if (node.data?.estree?.body.length === 0) {
        return ''
      }
      throw new Error(`Expressions have no Markdown in ${context.file}`)
    case 'mdxjsEsm':
      return ''
    default:
      return renderRange(
        {
          start: node.position?.start.offset ?? 0,
          end: node.position?.end.offset ?? 0,
        },
        findMdxNodes(node),
        context,
      )
  }
}

/**
 * Copies a range of the source and converts the MDX nodes inside it.
 *
 * @param range - Offsets of the range.
 * @param range.start - Offset of the first character.
 * @param range.end - Offset after the last character.
 * @param nodes - Outermost MDX nodes inside the range, in their order.
 * @param context - Page of the range.
 * @returns Markdown of the range.
 */
async function renderRange(
  { start, end }: { start: number; end: number },
  nodes: MdxNode[],
  context: Context,
): Promise<string> {
  let markdown = await Promise.all(nodes.map(node => renderNode(node, context)))
  let parts: string[] = []
  let offset = start
  for (let [index, node] of nodes.entries()) {
    let nodeStart = node.position?.start.offset ?? offset
    parts.push(
      context.source.slice(offset, nodeStart),
      indentLines(markdown[index] ?? '', nodeStart, context),
    )
    offset = node.position?.end.offset ?? nodeStart
  }
  parts.push(context.source.slice(offset, end))
  return parts.join('')
}

/**
 * Reads one attribute of an element.
 *
 * @param attribute - Attribute to read.
 * @param context - Page of the element.
 * @returns Name and value of the attribute.
 * @throws Error - When the attribute is a spread or holds an expression other
 *   than the name of an import.
 */
function readProperty(
  attribute: MdxAttribute,
  context: Context,
): [string, string] {
  let { value, name } = attribute
  if (!name || attribute.type !== 'mdxJsxAttribute') {
    throw new Error(`Spread attributes have no Markdown in ${context.file}`)
  }
  if (typeof value !== 'object' || value === null) {
    return [name, value ?? '']
  }
  let imported = context.imports.get(value.value.trim())
  if (imported === undefined) {
    throw new Error(
      `${name}={${value.value}} has no Markdown in ${context.file}`,
    )
  }
  return [name, imported]
}

/**
 * Keeps the Markdown of an MDX node inside the list item or quote that holds
 * it. Every line after the first gets the text before the node on its source
 * line, with list markers and other text turned into spaces, so `> ` stays and
 * `- ` becomes two spaces. Empty lines get only the quote markers.
 *
 * @param markdown - Markdown of the node.
 * @param start - Offset of the node in the source.
 * @param context - Page of the node.
 * @returns Markdown with the later lines indented like the first one.
 */
function indentLines(
  markdown: string,
  start: number,
  context: Context,
): string {
  let lineStart = context.source.lastIndexOf('\n', start - 1) + 1
  let prefix = context.source
    .slice(lineStart, start)
    .replaceAll(/[^\s>]/gu, ' ')
  return markdown
    .split('\n')
    .map((line, index) => {
      if (index === 0) {
        return line
      }
      return line ? `${prefix}${line}` : prefix.trimEnd()
    })
    .join('\n')
}

/**
 * Writes the Markdown of an element with its renderer.
 *
 * @param node - Element to write.
 * @param context - Page of the element.
 * @returns Markdown of the element.
 * @throws Error - When the element has no renderer.
 */
async function renderElement(node: MdxNode, context: Context): Promise<string> {
  let name = node.name ?? ''
  let renderer = context.renderers[name]
  if (!renderer) {
    throw new Error(`<${name}> has no Markdown in ${context.file}`)
  }
  return renderer({
    children: await renderChildren(node, context),
    props: readProps(node, context),
  })
}

/**
 * Reads the attributes of an element. A value in braces must name an import.
 *
 * @param node - Element to read.
 * @param context - Page of the element.
 * @returns Attributes by name. An attribute without a value is empty.
 */
function readProps(node: MdxNode, context: Context): Record<string, string> {
  return Object.fromEntries(
    (node.attributes ?? []).map(attribute => readProperty(attribute, context)),
  )
}

/**
 * Finds the outermost MDX nodes inside a node, in the order of the source.
 *
 * @param node - Node to search.
 * @returns MDX nodes that no other MDX node inside the node holds.
 */
function findMdxNodes(node: MdxNode): MdxNode[] {
  return (node.children ?? []).flatMap(child =>
    MDX_TYPES.has(child.type) ? [child] : findMdxNodes(child),
  )
}
