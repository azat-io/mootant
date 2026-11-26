export default {
  run: {
    timeout: { constant: 20000 },
    runner: 'node-test',
    paths: ['src'],
    cache: false,
  },
}
