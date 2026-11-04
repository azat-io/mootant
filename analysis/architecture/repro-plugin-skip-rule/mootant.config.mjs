import acme from './plugin.mjs'
export default {
  plugins: { acme },
  mutators: { 'acme/skip-everything': 'on' },
}
