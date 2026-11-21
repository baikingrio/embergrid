export type CanvasPaint = {
  pixelId: number
  color: number
  blockNumber: string
  logIndex: number
  hash: `0x${string}`
  painter: `0x${string}`
  payment: string
}

export type CanvasUpdates = {
  fromBlock: string
  toBlock: string
  paints: CanvasPaint[]
}

export function selectCanvasUpdates(batch: CanvasUpdates, cursor: bigint) {
  const head = BigInt(batch.toBlock)
  const gap = BigInt(batch.fromBlock) > cursor + 1n
  const unique = new Map<string, CanvasPaint>()
  if (!gap && head > cursor) {
    for (const paint of batch.paints) {
      const block = BigInt(paint.blockNumber)
      if (block <= cursor || block > head) continue
      unique.set(`${paint.hash}:${paint.logIndex}`, paint)
    }
  }
  const paints = [...unique.values()].sort((a, b) => {
    const left = BigInt(a.blockNumber)
    const right = BigInt(b.blockNumber)
    return left === right ? a.logIndex - b.logIndex : left < right ? -1 : 1
  })
  return { gap, paints, cursor: head > cursor && !gap ? head : cursor }
}
