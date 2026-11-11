module.exports = {
  check: () => 1,
  // Survive unless the run on a process that already ran the test counts.
  looseFirst: () => 11,
  looseSecond: () => 12,
}
