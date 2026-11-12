let state = { level: 1 }

// mootant-ignore-next-line string-literal: export name
Object.defineProperty(exports, 'level', {
  enumerable: true,
  get() {
    return state.level
  },
})

exports.raise = function raise(steps) {
  state.level += steps
  return state.level
}
