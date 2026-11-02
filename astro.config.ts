import {
  transformerNotationHighlight,
  transformerNotationDiff,
} from '@shikijs/transformers'
import { rehypeHeadingIds, unified } from '@astrojs/markdown-remark'
import { svgoOptimizer, defineConfig } from 'astro/config'
import rehypeExternalLinks from 'rehype-external-links'
import { browserslistToTargets } from 'lightningcss'
import remarkSectionize from 'remark-sectionize'
import browserslist from 'browserslist'
import sitemap from '@astrojs/sitemap'
import mdx from '@astrojs/mdx'

import { rehypeSearchSections } from './docs/plugins/rehype-search-sections'
import { rehypeHeadingAnchors } from './docs/plugins/rehype-heading-anchors'
import { rehypeMutantChanges } from './docs/plugins/rehype-mutant-changes'
import { rehypeCopyButtons } from './docs/plugins/rehype-copy-buttons'
import { remarkKillSection } from './docs/plugins/remark-kill-section'
import { remarkPageLead } from './docs/plugins/remark-page-lead'
import { rehypeTables } from './docs/plugins/rehype-tables'
import { reportDemo } from './docs/plugins/report-demo'
import { colorTheme } from './docs/utils/shiki-theme'

let site = 'https://mootant.org'

export default defineConfig({
  markdown: {
    processor: unified({
      rehypePlugins: [
        [
          rehypeExternalLinks,
          {
            rel: ['noopener', 'noreferrer'],
            target: '_blank',
          },
        ],
        rehypeHeadingIds,
        rehypeSearchSections,
        rehypeHeadingAnchors,
        rehypeCopyButtons,
        rehypeMutantChanges,
        rehypeTables,
      ],
      remarkPlugins: [remarkPageLead, remarkKillSection, remarkSectionize],
    }),
    shikiConfig: {
      transformers: [
        transformerNotationDiff({
          matchAlgorithm: 'v3',
        }),
        transformerNotationHighlight({
          matchAlgorithm: 'v3',
        }),
      ],
      theme: colorTheme,
    },
  },
  vite: {
    css: {
      lightningcss: {
        targets: browserslistToTargets(
          browserslist(
            browserslist.loadConfig({ path: '.' }) ?? browserslist.defaults,
          ),
        ),
      },
      transformer: 'lightningcss',
    },
  },
  experimental: {
    svgOptimizer: svgoOptimizer(),
    clientPrerender: true,
  },
  build: {
    inlineStylesheets: 'always',
    format: 'file',
  },
  integrations: [sitemap(), reportDemo(), mdx()],
  prefetch: {
    defaultStrategy: 'hover',
  },
  server: {
    port: 3000,
    host: true,
  },
  publicDir: './docs/public',
  compressHTML: true,
  srcDir: './docs',
  root: './docs',
  site,
})
