export default {
  test: {
    onUnhandledError(error: { message?: string }) {
      if (error.message?.includes('listener')) {
        return false
      }
    },
    include: ['test/**/*.test.ts'],
  },
}
