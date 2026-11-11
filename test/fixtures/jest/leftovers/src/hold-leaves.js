module.exports = {
  // Under its mutant the test leaves a server behind, and passes.
  holds: () => false,
  value: () => 1,
}
