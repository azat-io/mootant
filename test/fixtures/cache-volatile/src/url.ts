export function page(url: string, number: number): string {
  return number > 1 ? `${url}&page=${number}` : url
}
