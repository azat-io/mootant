module.exports = {
  process(code) {
    if (code.includes('globalThis')) {
      throw new Error('This transformer refuses globalThis\nmore lines')
    }
    return { code }
  },
}
