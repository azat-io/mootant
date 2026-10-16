import { svelte } from '@sveltejs/vite-plugin-svelte'

export default {
  test: {
    include: ['test/**/*.test.ts'],
  },
  plugins: [svelte({ configFile: false })],
}
