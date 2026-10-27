import type { CollectionEntry } from 'astro:content'
import type { APIRoute } from 'astro'

import { getCollection, render } from 'astro:content'

import type { SearchSection } from '../plugins/rehype-search-sections'
import type { SearchDocument } from '../utils/search-document'

import { frontmatter as mutatorsPage } from '../content/mutators.md'
import { pages } from '../utils/pages'

/**
 * Builds the index that the docs search loads: every section of every guide and
 * mutator page and of the page that lists the mutators, as the
 * `rehypeSearchSections` Markdown plugin splits them.
 *
 * @returns JSON array of search documents.
 */
export const GET: APIRoute = async () => {
  let guides = await getCollection('guide')
  let mutators = await getCollection('mutators')
  let documents = await Promise.all([
    ...guides.map(guide => getEntryDocuments(guide, `/guide/${guide.id}`)),
    ...mutators.map(mutator =>
      getEntryDocuments(mutator, `/mutators/${mutator.id}`),
    ),
  ])
  let listDocuments = getDocuments(
    mutatorsPage['searchSections'] as SearchSection[],
    '/mutators',
    [String(mutatorsPage['title'])],
  )
  return Response.json([...documents.flat(), ...listDocuments])
}

/**
 * Turns the sections of a guide or mutator page into search documents.
 *
 * @param entry - Guide or mutator page.
 * @param url - Address of the page.
 * @returns Search documents of the page, in its order.
 */
async function getEntryDocuments(
  entry: CollectionEntry<'mutators'> | CollectionEntry<'guide'>,
  url: string,
): Promise<SearchDocument[]> {
  let { remarkPluginFrontmatter } = await render(entry)
  let group = pages.find(({ links }) => links.some(link => link.url === url))
  return getDocuments(
    remarkPluginFrontmatter['searchSections'] as SearchSection[],
    url,
    group ? [group.title, entry.data.title] : [entry.data.title],
  )
}

/**
 * Turns the sections of one docs page into search documents.
 *
 * @param sections - Sections of the page.
 * @param url - Address of the page.
 * @param titles - Titles above the page's own headings, the page title last.
 * @returns Search documents of the page, in its order.
 */
function getDocuments(
  sections: SearchSection[],
  url: string,
  titles: string[],
): SearchDocument[] {
  return sections.map(({ headings, text, id }) => ({
    titles: [...titles, ...headings].slice(0, -1),
    title: headings.at(-1) ?? titles.at(-1)!,
    url: id ? `${url}#${id}` : url,
    text,
  }))
}
