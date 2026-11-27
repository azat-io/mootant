export default {
  test: {
    projects: [
      {
        define: { __BUILD_TIME__: JSON.stringify(new Date().toISOString()) },
        test: {
          globalSetup: ['test/a/global.ts'],
          include: ['test/a/*.test.ts'],
          name: 'a',
        },
      },
      {
        define: {
          'import.meta.buildTime': JSON.stringify(new Date().toISOString()),
          'app.started': JSON.stringify(new Date().toISOString()),
        },
        test: { include: ['test/b/*.test.ts'], name: 'b' },
      },
      {
        define: {
          'process.env.MOOTANT_INIT':
            '(globalThis.mootantUrl = globalThis.__vitest_worker__.providedContext.apiUrl, "fixed")',
        },
        test: {
          globalSetup: ['test/a/global.ts'],
          include: ['test/c/*.test.ts'],
          name: 'c',
        },
      },
    ],
  },
}
