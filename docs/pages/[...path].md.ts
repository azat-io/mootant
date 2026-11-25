import type { APIRoute } from 'astro'

import { getMarkdownSections } from '../utils/get-markdown-sections'
import { getHomeMarkdown } from '../utils/get-home-markdown'
import { linkToMarkdown } from '../utils/link-to-markdown'

interface Props {
  /**
   * Writes the Markdown of the page.
   */
  getMarkdown(): Promise<string> | string

  /**
   * Addresses of the pages with a Markdown version, which links point to.
   */
  pages: Set<string>

  /**
   * Status of the response, 404 for the page of missing addresses.
   */
  status?: number
}

/**
 * Markdown of the page that answers a missing address.
 */
const NOT_FOUND = [
  '# Page not Found',
  '',
  'Back to [Home](/index.md). [llms.txt](/llms.txt) lists every page.',
  '',
].join('\n')

/**
 * Lists the Markdown versions of the pages for agents: `/index.md` for the home
 * page, the address of every docs page with `.md` at the end and `/404.md` for
 * missing addresses.
 *
 * @returns Path and Markdown of each page.
 */
export async function getStaticPaths(): Promise<
  {
    params: { path: string }
    props: Props
  }[]
> {
  let sections = await getMarkdownSections()
  let pages = sections.flatMap(section => section.pages)
  let urls = new Set(['/', ...pages.map(({ url }) => url)])
  return [
    {
      props: { getMarkdown: () => getHomeMarkdown(sections), pages: urls },
      params: { path: 'index' },
    },
    ...pages.map(({ getMarkdown, url }) => ({
      props: { pages: urls, getMarkdown },
      params: { path: url.slice(1) },
    })),
    {
      props: { getMarkdown: () => NOT_FOUND, pages: urls, status: 404 },
      params: { path: '404' },
    },
  ]
}

/**
 * Answers with the Markdown of a page, its links made absolute and pointed at
 * the Markdown of the docs pages.
 *
 * @param context - Request context with the page.
 * @param context.props - Page to answer with.
 * @param context.site - Address of the docs.
 * @returns Response with the Markdown.
 */
export const GET: APIRoute<Props> = async ({ props, site }) =>
  new Response(linkToMarkdown(await props.getMarkdown(), props.pages, site), {
    headers: { 'content-type': 'text/markdown; charset=utf-8' },
    status: props.status ?? 200,
  })
