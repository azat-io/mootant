export class Tally {
  count: number

  constructor(start: number) {
    this.count = $state(start)
  }

  add(amount: number): void {
    this.count += amount
  }
}
