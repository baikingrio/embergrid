import assert from 'node:assert/strict'
import test from 'node:test'
import { createSnapshotCache, mergeCanvasSnapshot } from '../app/lib/canvasSnapshot.ts'

test('a shared snapshot keeps a paint until it reaches the paint block', () => {
  const pins = new Map([[1, { color: 4, blockNumber: 10n }]])
  const merged = mergeCanvasSnapshot({
    blockNumber: '9',
    colors: [0, 1, 2],
    owned: [0, 1, 0],
  }, pins)
  assert.equal(merged.colors[1], 4)
  assert.equal(merged.owned[1], 1)
  assert.deepEqual(merged.released, [])

  const caughtUp = mergeCanvasSnapshot({
    blockNumber: '10',
    colors: [0, 4, 2],
    owned: [0, 1, 0],
  }, pins)
  assert.deepEqual(caughtUp.released, [1])
})

test('concurrent readers share one canvas load until the snapshot expires', async () => {
  const cache = createSnapshotCache<number>(10_000)
  let calls = 0
  const load = async () => {
    calls += 1
    await new Promise((resolve) => setTimeout(resolve, 10))
    return 7
  }
  const [first, second] = await Promise.all([cache.get(load, 1_000), cache.get(load, 1_000)])
  assert.equal(calls, 1)
  assert.equal(first, 7)
  assert.equal(second, 7)
  assert.equal(await cache.get(load, 20_000), 7)
  assert.equal(calls, 2)
})

test('a newer snapshot releases a confirmed paint even when another user changed its color', () => {
  const pins = new Map([[1, { color: 4, blockNumber: 10n }]])
  const result = mergeCanvasSnapshot({ blockNumber: '11', colors: [0, 7], owned: [0, 1] }, pins)
  assert.equal(result.colors[1], 7)
  assert.deepEqual(result.released, [1])
})
