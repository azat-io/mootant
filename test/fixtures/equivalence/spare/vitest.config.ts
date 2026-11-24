export default {
  test: {
    include: ['test/**/*.test.ts'],
    environment: './journal.ts',
    setupFiles: ['./setup.ts'],
  },
}
