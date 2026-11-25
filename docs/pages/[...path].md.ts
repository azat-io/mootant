import type { APIRoute } from 'astro'

import { getMarkdownSections } from '../utils/get-markdown-sections'
import { getHomeMarkdown } from '../utils/get-home-markdown'

interface Props {
  /**
   * Writes the Markdown of the page.
   */
  getMarkdown(): Promise<string> | string

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
  return [
    {
      props: { getMarkdown: () => getHomeMarkdown(sections) },
      params: { path: 'index' },
    },
    ...pages.map(({ getMarkdown, url }) => ({
      params: { path: url.slice(1) },
      props: { getMarkdown },
    })),
    {
      props: { getMarkdown: () => NOT_FOUND, status: 404 },
      params: { path: '404' },
    },
  ]
}

/**
 * Answers with the Markdown of a page.
 *
 * @param context - Request context with the page.
 * @param context.props - Page to answer with.
 * @returns Response with the Markdown.
 */
export const GET: APIRoute<Props> = async ({ props }) =>
  new Response(await props.getMarkdown(), {
    headers: { 'content-type': 'text/markdown; charset=utf-8' },
    status: props.status ?? 200,
  })
