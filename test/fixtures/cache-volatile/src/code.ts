export function host(url: string): string {
  return url.startsWith('http://') ? new URL(url).hostname : ''
}
