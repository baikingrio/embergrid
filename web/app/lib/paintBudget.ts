const MIN_BASE_FEE = 100_000_000_000n
const PRIORITY_FEE = 3_000_000_000n

export function gasUnitsForPaint(pixelCount: number) {
  if (pixelCount <= 1) return 120_000n
  return 80_000n + 60_000n * BigInt(pixelCount)
}

export function paintBudget(pixelCount: number, payment: bigint, balance: bigint, baseFee: bigint) {
  const units = gasUnitsForPaint(pixelCount)
  const price = (baseFee > MIN_BASE_FEE ? baseFee : MIN_BASE_FEE) + PRIORITY_FEE
  const gas = units * price
  const needed = payment + gas
  return {
    units,
    gas,
    needed,
    short: balance < needed,
  }
}
