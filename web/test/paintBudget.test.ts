import assert from 'node:assert/strict'
import test from 'node:test'
import { parseEther } from 'viem'
import { paintBudget } from '../app/lib/paintBudget.ts'

test('one claim covers a single pixel but not a full 64-pixel batch', () => {
  const balance = parseEther('0.2')
  const baseFee = 100_000_000_000n
  const one = paintBudget(1, parseEther('0.01'), balance, baseFee)
  assert.equal(one.short, false)

  const batch = paintBudget(64, parseEther('0.64'), balance, baseFee)
  assert.equal(batch.short, true)
  assert.equal(batch.needed > parseEther('0.64'), true)
})
