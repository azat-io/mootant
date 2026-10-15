/**
 * Resources the code under test opens and closes; the environment waits for
 * them to close when it is torn down.
 */
interface Pool {
  open: number
}

export default {
  setup(global: { pool?: Pool }) {
    global.pool = { open: 0 }
    return {
      async teardown(global: { pool?: Pool }) {
        if (global.pool!.open !== 0) {
          await new Promise(() => {})
        }
      },
    }
  },
  viteEnvironment: 'ssr',
  name: 'leaks',
}
