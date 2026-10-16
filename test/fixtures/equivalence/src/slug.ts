let separators = /[^\da-z]+/gi

export function slug(text: string): string {
  return text.replace(separators, '-').replace(/^-|-$/g, '').toLowerCase()
}

export function isSlug(text: string): boolean {
  return new RegExp('^[a-z\\d]+(?:-[a-z\\d]+)*$').test(text)
}
