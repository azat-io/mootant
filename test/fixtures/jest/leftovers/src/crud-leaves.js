module.exports = {
  // Under its mutant a test fails with the file made, and the last test still
  // removes it.
  render: () => 2,
  // Reached before the file is made, and survive unless a file left behind
  // falsifies them.
  looseFirst: () => 4,
  looseSecond: () => 5,
  looseThird: () => 6,
}
