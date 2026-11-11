module.exports = {
  // Under its mutant the test leaves something behind.
  leaves: () => false,
  // Runs after that mutant, and survives unless what it left falsifies it.
  scale: value => value * 2,
}
