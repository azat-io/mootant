export default {
  test: {
    onUnhandledError(error: { message?: string }) {
      if (error.message?.includes('ResizeObserver')) {
        return false
      }
    },
    include: ['test/**/*.test.ts'],
  },
}
