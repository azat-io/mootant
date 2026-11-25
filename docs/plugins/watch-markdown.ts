import type { AstroIntegration } from 'astro'

import { fileURLToPath } from 'node:url'
import { readdirSync } from 'node:fs'

/**
 * Reloads the Markdown configuration when its local plugins or embedded icons
 * change. Astro loads these outside the page module graph. Repository Markdown
 * files outside the docs root use ordinary module updates instead of restarts.
 *
 * @returns Integration that watches Markdown processing and source files.
 */
export function watchMarkdown(): AstroIntegration {
  return {
    hooks: {
      'astro:config:setup': ({ addWatchFile, command }) => {
        if (command !== 'dev') {
          return
        }
        let plugins = new URL('./', import.meta.url)
        for (let file of readdirSync(plugins)) {
          if (file !== 'report-demo.ts' && file.endsWith('.ts')) {
            addWatchFile(new URL(file, plugins))
          }
        }
        let icons = new URL('../icons/', import.meta.url)
        for (let file of readdirSync(icons)) {
          if (file.endsWith('.svg')) {
            addWatchFile(new URL(file, icons))
          }
        }
        addWatchFile(new URL('../utils/get-changed-range.ts', import.meta.url))
        addWatchFile(new URL('../utils/shiki-theme.ts', import.meta.url))
      },
      'astro:server:setup': ({ server }) => {
        server.watcher.add(
          ['../../changelog.md', '../../contributing.md'].map(file =>
            fileURLToPath(new URL(file, import.meta.url)),
          ),
        )
      },
    },
    name: 'mootant:watch-markdown',
  }
}
