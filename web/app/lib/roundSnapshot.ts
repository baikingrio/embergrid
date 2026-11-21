import { zeroAddress, type Address } from 'viem'

export type RoundSnapshot = {
  lastPainter: Address
  endTime: number
  syncedAt: number
}

let snapshot: RoundSnapshot = {
  lastPainter: zeroAddress,
  endTime: 0,
  syncedAt: 0,
}

export function publishRoundSnapshot(next: { lastPainter: Address, endTime: number }) {
  snapshot = {
    lastPainter: next.lastPainter,
    endTime: next.endTime,
    syncedAt: Date.now(),
  }
}

export function readRoundSnapshot() {
  return snapshot
}

/** Wall-clock check aligned with the countdown UI; skips RPC when clearly not due. */
export function roundLikelyDue(nowSec = Math.floor(Date.now() / 1000)) {
  if (snapshot.lastPainter === zeroAddress || snapshot.endTime <= 0) return false
  return nowSec >= snapshot.endTime
}
