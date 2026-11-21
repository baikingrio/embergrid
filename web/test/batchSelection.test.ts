import assert from 'node:assert/strict'
import test from 'node:test'
import { batchPricesMatch, samePixelIds, toggleBatchId } from '../app/lib/batchSelection.ts'

test('toggle adds, removes, and stops at 64', () => {
  const added = toggleBatchId([], 2)
  assert.deepEqual(added.ids, [2])
  assert.equal(added.error, null)

  const again = toggleBatchId(added.ids, 2)
  assert.deepEqual(again.ids, [])

  const full = Array.from({ length: 64 }, (_, index) => index)
  const overflow = toggleBatchId(full, 100)
  assert.equal(overflow.error, '批量最多 64 格')
  assert.deepEqual(overflow.ids, full)

  const invalid = toggleBatchId([], 4096)
  assert.equal(invalid.error, '像素编号需在 0 到 4095')
  assert.deepEqual(invalid.ids, [])
})

test('a changed pixel price rejects the whole confirmed batch', () => {
  assert.equal(samePixelIds([1, 2], [1, 2]), true)
  assert.equal(samePixelIds([1, 2], [2, 1]), false)
  assert.equal(batchPricesMatch([10n, 20n], [10n, 20n]), true)
  assert.equal(batchPricesMatch([10n, 20n], [10n, 21n]), false)
})
