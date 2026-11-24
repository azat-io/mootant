import { ImageResponse } from 'takumi-js/response'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { escapeHtml } from '../../cli/html/client/escape-html'
import wordmark from '../components/Wordmark.astro?raw'
import logo from '../components/Logo.astro?raw'
import colors from '../styles/colors.css?raw'

/**
 * Text of the Open Graph image of a page.
 */
export interface OpenGraphCard {
  /**
   * Text under the title, cut after four lines.
   */
  description?: string

  /**
   * Whether the card is the one of the home page: a smaller title with the
   * description under it in capitals, like the slogan of the hero, and a bigger
   * logo.
   */
  home?: boolean

  /**
   * Line above the title: the section of the page.
   */
  label?: string

  /**
   * Title with a line feed where a line breaks. A line too long for the card
   * gets smaller.
   */
  title: string
}

/**
 * Color token in a fill, such as `var(--color-content-primary)`.
 */
const TOKEN_PATTERN = /var\((?<token>--[\w-]+)\)/gu

/**
 * Layout of the card. Colors come from the tokens of the dark theme, fonts from
 * the files of the docs.
 */
const STYLES = `
  .card {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    inline-size: 100%;
    block-size: 100%;
    padding-block: 72px;
    padding-inline: 80px;
    font-family: Sora;
    color: var(--color-content-primary);
    background: var(--color-background-primary);
  }

  .wordmark {
    display: grid;
    inline-size: 280px;
  }

  .body {
    display: flex;
    gap: 64px;
    align-items: flex-end;
  }

  .content {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-inline-size: 0;
  }

  .label {
    margin-block-end: 20px;
    font: 600 24px / 1.4 'JetBrains Mono';
    color: var(--color-content-brand);
    text-transform: uppercase;
  }

  .title {
    font-size: 88px;
    font-weight: 600;
    line-height: 1.15;
    white-space: pre;
    text-fit: shrink;
  }

  .description {
    margin-block-start: 24px;
    font-size: 30px;
    line-height: 1.5;
    color: var(--color-content-secondary);
    text-wrap: pretty;
    line-clamp: 4;
  }

  .logo {
    display: grid;
    flex-shrink: 0;
    inline-size: 220px;
  }

  .layer {
    display: flex;
    grid-area: 1 / 1;
  }

  .layer svg {
    inline-size: 100%;
  }

  .home .title {
    font-size: 72px;
  }

  .home .description {
    margin-block-start: 28px;
    font: 600 24px / 1.4 'JetBrains Mono';
    text-transform: uppercase;
  }

  .home .logo {
    align-self: center;
    inline-size: 260px;
  }
`

/**
 * Colors of the docs without `color-scheme`, which Takumi does not support and
 * warns about.
 */
let tokens = colors.replaceAll(/color-scheme:[^;]+;/gu, '')

/**
 * Fonts of the docs. The dev server and the build of the docs run from the root
 * of the repository.
 */
let fonts = path.join(process.cwd(), 'docs', 'public', 'fonts')

/**
 * Draws the Open Graph image of a docs page, 1200 by 630 pixels, in the dark
 * theme of the site: the wordmark at the top, the text of the page at the
 * bottom and the logo next to it.
 *
 * @param card - Text of the image.
 * @returns Response with the PNG image.
 */
export function renderOpenGraph({
  description,
  label,
  title,
  home,
}: OpenGraphCard): ImageResponse {
  let html = `
    <div class="${home ? 'card home' : 'card'}" data-theme="dark">
      <div class="wordmark">${getLayers(wordmark)}</div>
      <div class="body">
        <div class="content">
          ${label ? `<div class="label">${escapeHtml(label)}</div>` : ''}
          <div class="title">${escapeHtml(title)}</div>
          ${description ? `<div class="description">${escapeHtml(description)}</div>` : ''}
        </div>
        <div class="logo">${getLayers(logo)}</div>
      </div>
    </div>
  `
  return new ImageResponse(html, {
    fonts: [
      {
        data: () => readFile(path.join(fonts, 'sora-regular.woff2')),
        name: 'Sora',
        weight: 400,
      },
      {
        data: () => readFile(path.join(fonts, 'sora-bold.woff2')),
        name: 'Sora',
        weight: 700,
      },
      {
        data: () => readFile(path.join(fonts, 'jetbrains-mono.woff2')),
        name: 'JetBrains Mono',
      },
    ],
    css: [tokens, STYLES],
    height: 630,
    width: 1200,
  })
}

/**
 * Splits the `<svg>` element of a docs component into layers, one for each
 * color token its paths are filled with. Takumi draws an SVG image without the
 * style sheets, so a token in a fill would come out black. In its layer, a path
 * fills with `currentColor`, and the layer takes the token as its color.
 *
 * @param component - Source of the Astro component.
 * @returns Markup of the layers, from the bottom one up.
 */
function getLayers(component: string): string {
  let svg = component
    .slice(component.indexOf('<svg'), component.indexOf('</svg>') + 6)
    .replace(/\s+class:list=\{\[[^\]]*\]\}/u, '')
    .replace(/\s+\{\.\.\.props\}/u, '')
  let names = new Set(
    Array.from(svg.matchAll(TOKEN_PATTERN), match => match.groups!['token']!),
  )
  return [...names]
    .map(name => {
      let layer = svg.replaceAll(TOKEN_PATTERN, (_, token: string) =>
        token === name ? 'currentColor' : 'none',
      )
      return `<div class="layer" style="color: var(${name})">${layer}</div>`
    })
    .join('')
}
