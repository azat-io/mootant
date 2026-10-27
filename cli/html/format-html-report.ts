import type { HtmlReport } from '../../types/report/html-report'

import jetbrainsMono from '../../docs/public/fonts/jetbrains-mono.woff2?inline'
import soraRegular from '../../docs/public/fonts/sora-regular.woff2?inline'
import soraBold from '../../docs/public/fonts/sora-bold.woff2?inline'
import { serializeReportData } from './serialize-report-data'
import colors from '../../docs/styles/colors.css?raw'
import spaces from '../../docs/styles/spaces.css?raw'
import client from './client/main.ts?inline-script'
import fonts from '../../docs/styles/fonts.css?raw'
import sizes from '../../docs/styles/sizes.css?raw'
import base from '../../docs/styles/base.css?raw'
import { escapeHtml } from './client/escape-html'
import styles from './report.css?raw'

/**
 * Picks the theme before the first paint, as the docs do: the one chosen with
 * the toggle, else the system one. Storage may be unavailable for a file.
 */
const THEME_SCRIPT = `try{let t=localStorage.getItem('mootant-report-theme');document.documentElement.dataset.theme=t==='dark'||t==='light'?t:matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}catch{document.documentElement.dataset.theme=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}`

/**
 * Fonts of the docs, embedded so that the report opens offline.
 */
const FONT_FACES = [
  ['Sora', 'normal', soraRegular],
  ['Sora', 'bold', soraBold],
  ['JetBrains Mono', 'normal', jetbrainsMono],
]
  .map(
    ([family, weight, source]) =>
      `@font-face{font-family:'${family}';font-weight:${weight};font-display:swap;src:url(${source}) format('woff2')}`,
  )
  .join('')

/**
 * Builds the HTML report as one file that opens offline: the tokens, base
 * styles and fonts of the docs, the styles of the report, its data as JSON in a
 * `<script type="application/json">` element, and the client that renders the
 * pages from it. The `@font-face` rules of the docs are dropped, since their
 * files are not next to the report; the fonts come embedded instead.
 *
 * @param report - Data of the report.
 * @returns Text of the HTML file.
 */
export function formatHtmlReport(report: HtmlReport): string {
  let { project, version } = report.meta
  let tokens = fonts.replaceAll(/@font-face\s*\{[^}]*\}/gu, '')
  return `<!doctype html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="generator" content="mootant ${escapeHtml(version)}">
<title>${escapeHtml(project)} · mootant report</title>
<script>${THEME_SCRIPT}</script>
<style>${FONT_FACES}${colors}${spaces}${sizes}${tokens}${base}${styles}</style>
</head>
<body>
<noscript>The report needs JavaScript to show its pages.</noscript>
<div id="app"></div>
<script type="application/json" id="report-data">${serializeReportData(report)}</script>
<script>${client.replaceAll('</script', String.raw`<\/script`)}</script>
</body>
</html>
`
}
