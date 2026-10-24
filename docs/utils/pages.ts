interface Section {
  links: Page[]
  title: string
}

interface Page {
  title: string
  url: string
}

/**
 * Sections of the docs sidebar in reading order. Previous and next page links
 * follow the same order.
 */
export let pages: Section[] = [
  {
    links: [
      {
        url: '/guide/getting-started',
        title: 'Getting started',
      },
    ],
    title: 'Guide',
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
