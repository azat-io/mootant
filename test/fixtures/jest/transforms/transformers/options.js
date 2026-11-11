module.exports = {
  process(code, file, options) {
    return {
      code: code.replaceAll('__SUFFIX__', options.transformerConfig.suffix),
    }
  },
}
