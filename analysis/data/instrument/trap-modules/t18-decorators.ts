const log: string[] = []
function tag(label: string) {
  return function (target: any, key?: string) {
    log.push(label + ':' + (key ?? target.name))
  }
}
class Service {
  @tag('field' + 1) limit = 3 + 1
  constructor(private readonly base: number = 2 * 1) {}
  @tag('method') compute(x: number) {
    return x > this.limit ? x * this.base : x - 1
  }
}
export function probe() {
  let s = new Service()
  return { r: [s.compute(5), s.compute(1), s.limit], log }
}
