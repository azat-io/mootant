/**
 * Part of the context of a Netlify edge function that this function uses.
 */
interface Context {
  /**
   * Passes the request on to the static files of the site.
   */
  next(): Promise<Response>
}

/**
 * Hosts that `_redirects` sends to the canonical domain. Edge functions run
 * before redirects, so requests to these hosts pass through.
 */
const REDIRECTED_HOSTS = new Set(['mootant.netlify.app'])

/**
 * Request headers that must not apply to the page of a missing address: its
 * Markdown is always sent whole, with the status of the missing page.
 */
const CONDITIONAL_HEADERS = [
  'if-unmodified-since',
  'if-modified-since',
  'if-none-match',
  'if-match',
  'if-range',
  'range',
]

/**
 * Type of the responses with Markdown.
 */
const MARKDOWN_TYPE = 'text/markdown; charset=utf-8'

/**
 * Answers a request that prefers Markdown to HTML with the Markdown version of
 * the page: `/index.md` for the home page and the address with `.md` at the end
 * for any other page. A page without one gets its HTML, and a missing address
 * gets `/404.md` with the 404 status. The Markdown is fetched without the
 * Accept header, so the request does not run this function again.
 *
 * @param request - Request to the site.
 * @param context - Context of the edge function.
 * @returns Markdown or the response of the site.
 */
export default async function markdownNegotiation(
  request: Request,
  context: Context,
): Promise<Response> {
  let url = new URL(request.url)
  if (
    REDIRECTED_HOSTS.has(url.hostname) ||
    !prefersMarkdown(request.headers.get('accept'))
  ) {
    return context.next()
  }
  let headers = new Headers(request.headers)
  headers.delete('accept')
  let markdownPath = getMarkdownPath(url.pathname)
  if (markdownPath) {
    let markdown = await fetchPath(request, markdownPath, headers)
    /**
     * A 304 comes from the conditional headers of the client, so it confirms
     * the Markdown that the client keeps.
     */
    if (markdown.status === 304 || isMarkdown(markdown)) {
      return toMarkdownResponse(markdown, markdown.status)
    }
  }
  let response = await context.next()
  if (response.status !== 404) {
    return response
  }
  for (let name of CONDITIONAL_HEADERS) {
    headers.delete(name)
  }
  let notFound = await fetchPath(request, '/404.md', headers)
  return isMarkdown(notFound) ? toMarkdownResponse(notFound, 404) : response
}

/**
 * Runs the function only for requests that name Markdown in the Accept header,
 * so browsers get the static files directly. The header pattern is a coarse
 * filter: it also matches a header that ranks Markdown below HTML. Media types
 * ignore case, and Netlify keeps no flags of the pattern, so it lists both
 * cases of each letter. HEAD requests get the Markdown headers through this GET
 * route: the manifest of edge functions rejects HEAD as a method.
 */
export let config = {
  header: { accept: '[Tt][Ee][Xx][Tt]/[Mm][Aa][Rr][Kk][Dd][Oo][Ww][Nn]' },
  excludedPath: ['/_astro/*', '/fonts/*'],
  method: 'GET',
  path: '/*',
}

/**
 * Finds the quality that an Accept header gives a media type: the `q` of the
 * most specific range that matches it. The type itself comes first, then its
 * group, such as `text/*`, then the range of all types.
 *
 * @param accept - Accept header of the request.
 * @param mediaType - Media type to rank, such as `text/html`.
 * @returns Quality from 0 to 1, or 0 when no range matches.
 */
function getQuality(accept: string, mediaType: string): number {
  let ranges = [mediaType, `${mediaType.split('/', 1)[0]}/*`, '*/*']
  let best = { specificity: ranges.length, quality: 0 }
  for (let range of accept.split(',')) {
    let [name = '', ...parameters] = range
      .split(';')
      .map(part => part.trim().toLowerCase())
    let specificity = ranges.indexOf(name)
    if (specificity !== -1 && specificity < best.specificity) {
      best = { quality: readQuality(parameters), specificity }
    }
  }
  return best.quality
}

/**
 * Makes the response with Markdown. Fetch decodes the body, so the encoding and
 * length headers no longer describe it, and the platform sets them again.
 *
 * @param response - Response with the Markdown.
 * @param status - Status of the new response.
 * @returns Response with the type of Markdown that varies by Accept.
 */
function toMarkdownResponse(response: Response, status: number): Response {
  let headers = new Headers(response.headers)
  headers.delete('content-encoding')
  headers.delete('content-length')
  headers.set('content-type', MARKDOWN_TYPE)
  let vary = headers.get('vary')
  if (
    !vary
      ?.toLowerCase()
      .split(/\s*,\s*/u)
      .includes('accept')
  ) {
    headers.set('vary', vary ? `${vary}, Accept` : 'Accept')
  }
  return new Response(response.body, { headers, status })
}

/**
 * Finds the address of the Markdown version of a page.
 *
 * @param pathname - Path of the page, such as `/guide/cli`.
 * @returns Path of the Markdown, or null for a file such as `/llms.txt`.
 */
function getMarkdownPath(pathname: string): string | null {
  let page = pathname.length > 1 ? pathname.replace(/\/$/u, '') : pathname
  if (page === '/') {
    return '/index.md'
  }
  let name = page.slice(page.lastIndexOf('/') + 1)
  return name.includes('.') ? null : `${page}.md`
}

/**
 * Reads the `q` parameter of a media range.
 *
 * @param parameters - Parameters of the range, such as `q=0.9`.
 * @returns Quality from 0 to 1. A range without `q` has 1, and a broken `q` 0.
 */
function readQuality(parameters: string[]): number {
  let parameter = parameters.find(part => part.startsWith('q='))
  if (!parameter) {
    return 1
  }
  let quality = Number.parseFloat(parameter.slice(2))
  return Number.isNaN(quality) ? 0 : Math.min(Math.max(quality, 0), 1)
}

/**
 * Requests another path of the site with the method of the original request.
 *
 * @param request - Original request.
 * @param pathname - Path to request.
 * @param headers - Headers of the original request without Accept.
 * @returns Response of the site.
 */
function fetchPath(
  request: Request,
  pathname: string,
  headers: Headers,
): Promise<Response> {
  let target = new URL(request.url)
  target.pathname = pathname
  return fetch(target, { method: request.method, headers })
}

/**
 * Tells whether an Accept header ranks Markdown at least as high as HTML. A tie
 * goes to Markdown, since the client named it.
 *
 * @param accept - Accept header of the request.
 * @returns True when the client prefers Markdown.
 */
function prefersMarkdown(accept: string | null): boolean {
  if (!accept) {
    return false
  }
  let markdown = getQuality(accept, 'text/markdown')
  return markdown > 0 && markdown >= getQuality(accept, 'text/html')
}

/**
 * Tells whether a response holds Markdown. The status does not count: the dev
 * server answers `/404.md` with 404, the deployed site with 200.
 *
 * @param response - Response of the site.
 * @returns True for a Markdown response.
 */
function isMarkdown(response: Response): boolean {
  return (
    response.headers.get('content-type')?.startsWith('text/markdown') === true
  )
}
