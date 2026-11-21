import assert from 'node:assert/strict'
import test from 'node:test'
import { movePixel } from '../app/lib/pixelMove.ts'

test('arrow keys move one pixel and stay inside the canvas', () => {
  assert.equal(movePixel(0, 'ArrowRight'), 1)
  assert.equal(movePixel(0, 'ArrowLeft'), 0)
  assert.equal(movePixel(0, 'ArrowUp'), 0)
  assert.equal(movePixel(0, 'ArrowDown'), 64)
  assert.equal(movePixel(4095, 'ArrowRight'), 4095)
  assert.equal(movePixel(4095, 'ArrowDown'), 4095)
  assert.equal(movePixel(65, 'Enter'), null)
})
