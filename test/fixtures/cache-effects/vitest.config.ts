export default {
  define: {
    __MOOTANT_DEFINE__: JSON.stringify(process.env.MOOTANT_DEFINE ?? ''),
  },
  test: {
    globalSetup: ['test/global.ts'],
    include: ['test/**/*.test.ts'],
  },
}
