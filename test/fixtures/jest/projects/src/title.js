exports.title = () =>
  typeof document === 'undefined' ? 'no page' : `page: ${document.title}`
