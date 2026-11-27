export function double(value: number): number {
  return value * 2
}

class Base {
  stored = 0

  set value(value: number) {
    this.stored = double(value)
  }

  get value(): number {
    return this.stored
  }
}

export class Child extends Base {
  // @ts-expect-error a field over an accessor, as in older code bases
  value = 5
}
