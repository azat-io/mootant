import type { KnipConfig } from 'knip'

export default {
  ignoreDependencies: ['@sveltejs/vite-plugin-svelte', '@vitejs/plugin-vue'],
  ignore: ['test/fixtures/**', 'docs/demo/**'],
  /* Cspell:disable-next-line */
  ignoreBinaries: ['mkfifo'],
} satisfies KnipConfig
