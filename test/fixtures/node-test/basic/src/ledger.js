let balance = 0

export function deposit(amount) {
  balance += amount
}

export function getBalance() {
  return balance
}
