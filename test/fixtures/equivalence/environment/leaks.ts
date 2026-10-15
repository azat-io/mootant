/**
 * Resources the code under test opens and closes; the environment checks them
 * when it is torn down, after every test file of the worker ran.
 */
interface Pool {
  open: number
}

export default {
  setup(global: { pool?: Pool }) {
    global.pool = { open: 0 }
    return {
      async teardown(global: { pool?: Pool }) {
        await new Promise(resolve => {
          setTimeout(resolve, 100)
        })
        let { open } = global.pool!
        delete global.pool
        if (open !== 0) {
          throw new Error(`${open} left open`)
        }
      },
    }
  },
  viteEnvironment: 'ssr',
  name: 'leaks',
}
