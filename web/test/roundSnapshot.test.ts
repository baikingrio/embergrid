import assert from 'node:assert/strict'
import test from 'node:test'
import { zeroAddress } from 'viem'
import { publishRoundSnapshot, readRoundSnapshot, roundLikelyDue } from '../app/lib/roundSnapshot.ts'

test('roundLikelyDue is false before endTime and true at/after it', () => {
  publishRoundSnapshot({
    lastPainter: '0xd4E9Ab451aE304bA5D456774eF12C5C65D908E8f',
    endTime: 1_700_000_100,
  })
  assert.equal(roundLikelyDue(1_700_000_099), false)
  assert.equal(roundLikelyDue(1_700_000_100), true)
  assert.equal(roundLikelyDue(1_700_000_101), true)
})

test('roundLikelyDue is false with no painter or zero endTime', () => {
  publishRoundSnapshot({ lastPainter: zeroAddress, endTime: 1_700_000_100 })
  assert.equal(roundLikelyDue(1_700_000_200), false)
  publishRoundSnapshot({
    lastPainter: '0xd4E9Ab451aE304bA5D456774eF12C5C65D908E8f',
    endTime: 0,
  })
  assert.equal(roundLikelyDue(1_700_000_200), false)
  assert.equal(readRoundSnapshot().endTime, 0)
})
