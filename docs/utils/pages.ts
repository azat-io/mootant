import { getCollection } from 'astro:content'

interface Section {
  links: Page[]
  title: string
  url?: string
}

interface Page {
  title: string
  url: string
}

let mutators = await getCollection('mutators')

/**
 * Sections of the docs sidebar in reading order. A section with a URL has a
 * page of its own, which comes before its links. Previous and next page links
 * follow the same order.
 */
export let pages: Section[] = [
  {
    links: [
      {
        url: '/guide/getting-started',
        title: 'Getting started',
      },
      {
        url: '/guide/configuration',
        title: 'Configuration',
      },
      {
        url: '/guide/report',
        title: 'HTML report',
      },
    ],
    title: 'Guide',
  },
  {
    links: mutators
      .map(({ data: { title }, id }) => ({ url: `/mutators/${id}`, title }))
      .toSorted(({ title: a }, { title: b }) => a.localeCompare(b)),
    title: 'Mutators',
    url: '/mutators',
  },
]

/**
 * Returns the URL of a page as the sidebar lists it, without the `.html`
 * extension that pages get in the build.
 *
 * @param pathname - Path of the current page, such as
 *   `/guide/getting-started.html` in the build.
 * @returns URL as the sidebar lists it.
 */
export function getPageUrl(pathname: string): string {
  return pathname.replace(/\.html$/u, '')
}
