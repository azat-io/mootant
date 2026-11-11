module.exports = {
  // Its mutant kills before the store step, which leaves nothing.
  before: () => 1,
  // Reached before the store step, and survive unless a key left falsifies them.
  looseFirst: () => 11,
  looseSecond: () => 12,
  // Its mutant kills after the store step, which leaves the key of that worker.
  inside: () => 2,
}
