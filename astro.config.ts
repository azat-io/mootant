import { rehypeHeadingIds, unified } from '@astrojs/markdown-remark'
import { transformerNotationDiff } from '@shikijs/transformers'
import { svgoOptimizer, defineConfig } from 'astro/config'
import rehypeExternalLinks from 'rehype-external-links'
import { browserslistToTargets } from 'lightningcss'
import remarkSectionize from 'remark-sectionize'
import browserslist from 'browserslist'
import sitemap from '@astrojs/sitemap'

import { rehypeHeadingAnchors } from './docs/plugins/rehype-heading-anchors'
import { rehypeCopyButtons } from './docs/plugins/rehype-copy-buttons'
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
        rehypeHeadingAnchors,
        rehypeCopyButtons,
        rehypeHeadingIds,
      ],
      remarkPlugins: [remarkSectionize],
    }),
    shikiConfig: {
      transformers: [
        transformerNotationDiff({
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
  prefetch: {
    defaultStrategy: 'hover',
  },
  server: {
    port: 3000,
    host: true,
  },
  publicDir: './docs/public',
  integrations: [sitemap()],
  compressHTML: true,
  srcDir: './docs',
  root: './docs',
  site,
})
