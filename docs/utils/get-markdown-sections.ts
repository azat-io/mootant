import type { CollectionEntry } from 'astro:content'

import { parseFrontmatter } from '@astrojs/markdown-remark'
import { getCollection } from 'astro:content'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { communityPages } from './community-pages'
import { mdxToMarkdown } from './mdx-to-markdown'
import { mdxRenderers } from './mdx-renderers'
import { toCodeBlock } from './to-code-block'
import { pages } from './pages'

/**
 * Section of the sidebar with its pages.
 */
export interface MarkdownSection {
  /**
   * Pages of the section: its own page first, if it has one, then its links.
   */
  pages: MarkdownPage[]

  /**
   * Title of the section, such as `Guide`.
   */
  title: string
}

/**
 * Page of the docs with a Markdown version for agents.
 */
interface MarkdownPage {
  /**
   * Writes the Markdown of the page.
   */
  getMarkdown(): Promise<string>

  /**
   * What the page is about, in one or two sentences.
   */
  description: string

  /**
   * Title of the page.
   */
  title: string

  /**
   * Address of the page, such as `/guide/cli`.
   */
  url: string
}

/**
 * Root of the repository. Endpoints are bundled, so the files are found from
 * the directory the docs are built in.
 */
let root = process.cwd()

/**
 * Sources of the pages that are not entries of a collection, relative to the
 * root of the repository.
 */
let files: Record<string, undefined | string> = {
  [communityPages.branding.url]: 'docs/content/community/branding.mdx',
  [communityPages.contributing.url]: 'contributing.md',
  [communityPages.changelog.url]: 'changelog.md',
  '/agent-skill': 'docs/content/agent-skill.mdx',
  '/mutators': 'docs/content/mutators.mdx',
}

/**
 * Lists the sections of the sidebar in its order, each page with its Markdown:
 * the source of a Markdown page, an MDX page converted to Markdown, or a
 * mutator page with its example mutant under the title.
 *
 * @returns Sections of the docs.
 */
export async function getMarkdownSections(): Promise<MarkdownSection[]> {
  let guides = await getCollection('guide')
  let mutators = await getCollection('mutators')
  return Promise.all(
    pages.map(async ({ links, title, url }) => ({
      pages: await Promise.all(
        [url, ...links.map(link => link.url)]
          .filter(pageUrl => pageUrl !== undefined)
          .map(pageUrl => getPage(pageUrl, guides, mutators)),
      ),
      title,
    })),
  )
}

/**
 * Describes a page from a Markdown or MDX file. The frontmatter gives its title
 * and description, and Community gives them for the files of the repository.
 *
 * @param file - Source of the page, relative to the root of the repository.
 * @param url - Address of the page.
 * @returns Page with its Markdown.
 */
async function getFilePage(file: string, url: string): Promise<MarkdownPage> {
  let source = path.join(root, file)
  let { frontmatter, content } = parseFrontmatter(
    await readFile(source, 'utf8'),
  )
  let community = Object.values(communityPages).find(page => page.url === url)
  let title = String(frontmatter['title'] ?? community?.title)
  let description = String(frontmatter['description'] ?? community?.description)
  return {
    getMarkdown: async () =>
      addTitle(
        title,
        file.endsWith('.mdx') ?
          await mdxToMarkdown(content, source, mdxRenderers)
        : content,
      ),
    description,
    title,
    url,
  }
}

/**
 * Finds the source of a page of the sidebar and describes the page.
 *
 * @param url - Address from the sidebar.
 * @param guides - Entries of the guide collection.
 * @param mutators - Entries of the mutators collection.
 * @returns Page with its Markdown.
 * @throws Error - When the page has no known source.
 */
async function getPage(
  url: string,
  guides: CollectionEntry<'guide'>[],
  mutators: CollectionEntry<'mutators'>[],
): Promise<MarkdownPage> {
  let guide = guides.find(({ id }) => url === `/guide/${id}`)
  if (guide) {
    return getGuidePage(guide, url)
  }
  let mutator = mutators.find(({ id }) => url === `/mutators/${id}`)
  if (mutator) {
    return getMutatorPage(mutator, url)
  }
  let file = files[url]
  if (file) {
    return getFilePage(file, url)
  }
  throw new Error(`No Markdown source for ${url}`)
}

/**
 * Describes a mutator page. Its example mutant, which the page shows under the
 * title, comes first as a diff.
 *
 * @param entry - Mutator from the collection.
 * @param url - Address of the page.
 * @returns Page with its Markdown.
 */
function getMutatorPage(
  entry: CollectionEntry<'mutators'>,
  url: string,
): MarkdownPage {
  let { shortDescription, example, title } = entry.data
  let markdown = addTitle(
    title,
    [
      toCodeBlock(`- ${example.before}\n+ ${example.after}`, 'diff'),
      entry.body ?? '',
    ].join('\n\n'),
  )
  return {
    getMarkdown: () => Promise.resolve(markdown),
    description: shortDescription,
    title,
    url,
  }
}

/**
 * Describes a guide page, an MDX entry of the `guide` collection.
 *
 * @param entry - Guide page from the collection.
 * @param url - Address of the page.
 * @returns Page with its Markdown.
 */
function getGuidePage(
  entry: CollectionEntry<'guide'>,
  url: string,
): MarkdownPage {
  let { description, title } = entry.data
  let file = path.join(root, 'docs', entry.filePath ?? '')
  return {
    getMarkdown: async () =>
      addTitle(
        title,
        await mdxToMarkdown(entry.body ?? '', file, mdxRenderers),
      ),
    description,
    title,
    url,
  }
}

/**
 * Puts the title of a page above its Markdown, unless the Markdown starts with
 * a title of its own.
 *
 * @param title - Title of the page.
 * @param markdown - Markdown of the page.
 * @returns Markdown with one first level heading and a final line break.
 */
function addTitle(title: string, markdown: string): string {
  let body = markdown.trim()
  return `${body.startsWith('# ') ? body : `# ${title}\n\n${body}`}\n`
}
