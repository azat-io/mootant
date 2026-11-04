export default {
  mutators: {
    'skip-everything': {
      meta: { description: 'Test mutator that skips with a custom rule' },
      create() {
        return {
          BinaryExpression(node) {
            return [{ node, text: 'a - 1', skip: { rule: 'my-own-rule', reason: 'plugin rule' } }]
          },
        }
      },
    },
  },
}
