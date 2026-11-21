import { readFileSync } from 'node:fs'
import path from 'node:path'

export default {
  plugins: [
    {
      load(id) {
        if (id !== '\0virtual:limits') {
          return null
        }
        let file = path.resolve(import.meta.dirname, 'limits.json')
        this.addWatchFile(file)
        return `export default ${readFileSync(file, 'utf8')}`
      },
      resolveId(id) {
        return id === 'virtual:limits' ? '\0virtual:limits' : null
      },
      name: 'limits',
    },
  ],
  test: {
    include: ['test/**/*.test.ts'],
  },
}
