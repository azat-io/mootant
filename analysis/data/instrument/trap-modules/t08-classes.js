class Base {
  constructor(x) { this.base = x + 1; this.kind = new.target.name }
  m(k) { return 'base' + k }
  static sm() { return 'static' + 1 }
}
class Child extends Base {
  field = this.base * 2
  #p = 1
  static count = 0
  static { Child.count += 1; this.flag = Child.count > 0 }
  constructor(x) {
    super(x + 1)
    this.extra = super.m(x - 1)
    Child.count++
  }
  m(k) { return super.m(k + 1) + '!' }
  get p() { return this.#p + 0 }
  set p(v) { this.#p = v * 2 }
  static sm() { return super.sm() + '?' }
  acc = 3 + 0
}
export function probe() {
  let c = new Child(1)
  c.p = 5
  return { c: [c.base, c.kind, c.field, c.extra, c.m(2), c.p, Child.count, Child.flag, Child.sm(), c.acc] }
}
