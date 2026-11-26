export default {
  run: {
    timeout: { constant: 20000 },
    runner: 'vitest',
    paths: ['src'],
    cache: false,
  },
}
