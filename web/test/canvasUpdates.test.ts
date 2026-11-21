import assert from 'node:assert/strict'
import test from 'node:test'
import { selectCanvasUpdates, type CanvasPaint } from '../app/lib/canvasUpdates.ts'

const paint = (blockNumber: string, logIndex: number, color: number): CanvasPaint => ({
  pixelId: 42, color, blockNumber, logIndex,
  hash: `0x${'ab'.repeat(32)}`, painter: `0x${'12'.repeat(20)}`, payment: '10000000000000000',
})

test('overlapping feeds deduplicate by log index and preserve the last overwrite in a block', () => {
  const first = paint('17', 0, 1)
  const last = paint('17', 1, 2)
  const batch = { fromBlock: '0', toBlock: '17', paints: [last, first, first] }
  const result = selectCanvasUpdates(batch, 16n)
  assert.deepEqual(result.paints.map((p) => p.color), [1, 2])
  assert.equal(result.cursor, 17n)
  assert.deepEqual(selectCanvasUpdates(batch, result.cursor).paints, [])
})

test('a gap or a lagging provider never advances the cursor past missing changes', () => {
  const gap = selectCanvasUpdates({ fromBlock: '50', toBlock: '100', paints: [paint('100', 0, 3)] }, 16n)
  assert.equal(gap.gap, true)
  assert.equal(gap.cursor, 16n)
  assert.deepEqual(gap.paints, [])
  assert.equal(selectCanvasUpdates({ fromBlock: '0', toBlock: '15', paints: [] }, 17n).cursor, 17n)
})
