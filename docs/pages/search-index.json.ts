import type { APIRoute } from 'astro'

import { getCollection, render } from 'astro:content'

import type { SearchSection } from '../plugins/rehype-search-sections'
import type { SearchDocument } from '../utils/search-document'

import { pages } from '../utils/pages'

/**
 * Builds the index that the docs search loads: every section of every guide
 * page, as the `rehypeSearchSections` Markdown plugin splits it.
 *
 * @returns JSON array of search documents.
 */
export const GET: APIRoute = async () => {
  let guides = await getCollection('guide')
  let documents = await Promise.all(
    guides.map(async guide => {
      let { remarkPluginFrontmatter } = await render(guide)
      let sections = remarkPluginFrontmatter[
        'searchSections'
      ] as SearchSection[]
      let url = `/guide/${guide.id}`
      let group = pages.find(({ links }) =>
        links.some(link => link.url === url),
      )
      let titles = group ? [group.title, guide.data.title] : [guide.data.title]
      return sections.map(({ headings, text, id }): SearchDocument => ({
        titles: [...titles, ...headings].slice(0, -1),
        title: headings.at(-1) ?? guide.data.title,
        url: id ? `${url}#${id}` : url,
        text,
      }))
    }),
  )
  return Response.json(documents.flat())
}
