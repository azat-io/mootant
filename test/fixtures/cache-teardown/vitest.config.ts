export default {
  test: {
    projects: [
      {
        test: {
          include: ['test/fixture.test.ts', 'test/tree.test.ts'],
          name: 'node',
        },
      },
      {
        test: {
          environment: './test/environment.ts',
          include: ['test/environment.test.ts'],
          name: 'flag',
        },
      },
    ],
  },
}
