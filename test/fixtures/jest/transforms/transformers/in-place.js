module.exports = {
  createTransformer(options) {
    options.marker ??= 'set in place'
    return {
      process(code) {
        return { code: code.replaceAll('__MARKER__', options.marker) }
      },
    }
  },
}
