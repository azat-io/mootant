import { readFileSync } from 'node:fs'

export default {
  setup() {
    Reflect.set(
      globalThis,
      'mootantFlag',
      readFileSync(new URL('environment.txt', import.meta.url), 'utf8').trim(),
    )
    return {
      teardown() {
        Reflect.deleteProperty(globalThis, 'mootantFlag')
      },
    }
  },
  viteEnvironment: 'ssr',
  name: 'flag',
}
