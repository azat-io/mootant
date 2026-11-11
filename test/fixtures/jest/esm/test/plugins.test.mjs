import { runPlugin } from '../src/plugins.mjs'

test('loads a plugin with a dynamic import', async () => {
  await expect(runPlugin('double', 3)).resolves.toBe(7)
})
