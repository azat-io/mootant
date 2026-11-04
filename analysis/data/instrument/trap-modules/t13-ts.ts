enum Color { Red = 1, Green = Red + 1 }
abstract class Shape {
  constructor(protected readonly size: number, public label = 'shape' + 1) {}
  abstract area(): number
}
class Square extends Shape {
  extra = this.size * 2
  constructor(size: number, private scale: number = 1 + 0) {
    super(size * 1)
  }
  area(): number { return (this.size as number) * this.size * this.scale! }
  describe() { return <string>`${this.label}:${this.area() satisfies number}` }
}
function pick<T>(items: T[], index: number): T | undefined {
  return items[index + 0]!
}
export function probe() {
  let sq = new Square(3, 2)
  return { r: [sq.area(), sq.extra, sq.describe(), pick([1, 2, 3], 1), Color.Green, Color[2]] }
}
