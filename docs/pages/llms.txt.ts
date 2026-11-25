import type { APIRoute } from 'astro'

import { getMarkdownSections } from '../utils/get-markdown-sections'
import { toInlineCode } from '../utils/to-inline-code'
import { SKILL, HERO } from '../data/home'

/**
 * Lists the docs for agents in the llms.txt format: what Mootant is, then the
 * Markdown of every page by sidebar section, and other sources last.
 *
 * @param context - Request context.
 * @param context.site - Address of the docs.
 * @returns Response with the list.
 */
export const GET: APIRoute = async ({ site }) => {
  let sections = await getMarkdownSections()
  let blocks = [
    '# Mootant',
    `> ${HERO.slogan.replaceAll(/\s/gu, ' ')}. ${HERO.description}`,
    `Install Mootant with ${toInlineCode(HERO.install)} and the agent skill with ${toInlineCode(SKILL.install)}.`,
    ...sections.map(
      ({ pages, title }) =>
        `## ${title}\n\n${pages
          .map(
            page =>
              `- [${page.title}](${new URL(`${page.url}.md`, site)}): ${page.description}`,
          )
          .join('\n')}`,
    ),
    '## Optional',
    [
      `- [Home page](${new URL('/index.md', site)}): How Mootant works, what it works with and every page of the docs`,
      `- [Demo report](${new URL('/report/demo', site)}): HTML report of a run on a sample shop`,
      '- [GitHub repository](https://github.com/azat-io/mootant): Source code, issues and releases',
      '- [npm package](https://www.npmjs.com/package/mootant): Versions of the package',
    ].join('\n'),
  ]
  return new Response(`${blocks.join('\n\n')}\n`, {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  })
}
