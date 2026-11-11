module.exports = {
  // Under its mutant the test leaves its server behind.
  firstCheck: () => 1,
  // Reached before the server starts, and survives unless what a kill left
  // falsifies it.
  firstLoose: () => 11,
  secondCheck: () => 2,
  secondLoose: () => 12,
  thirdCheck: () => 3,
  thirdLoose: () => 13,
  fourthCheck: () => 4,
  fourthLoose: () => 14,
}
