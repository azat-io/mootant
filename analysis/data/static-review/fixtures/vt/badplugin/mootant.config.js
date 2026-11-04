// A plugin mutator with a bug: for `a + b` in math.js it writes a text that
// does not parse.
let broken = {
  meta: { description: 'Writes an unfinished expression.' },
  create(context) {
    return {
      BinaryExpression(node) {
        return context.file.endsWith('math.js') && node.operator === '+' ?
            [{ node, text: 'a +' }]
          : []
      },
    }
  },
}

export default {
  plugins: { acme: { mutators: { broken } } },
  mutators: { 'acme/broken': 'on' },
  run: { runner: 'vitest', paths: ['src'] },
}
