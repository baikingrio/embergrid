export const MAX_BATCH = 64

export function toggleBatchId(ids: readonly number[], id: number) {
  if (!Number.isInteger(id) || id < 0 || id > 4095) {
    return { ids: [...ids], error: '像素编号需在 0 到 4095' }
  }
  if (ids.includes(id)) {
    return { ids: ids.filter((current) => current !== id), error: null }
  }
  if (ids.length >= MAX_BATCH) {
    return { ids: [...ids], error: '批量最多 64 格' }
  }
  return { ids: [...ids, id], error: null }
}

export function addBatchIds(ids: readonly number[], incoming: readonly number[]) {
  const next = [...ids]
  let capped = false
  for (const id of incoming) {
    if (!Number.isInteger(id) || id < 0 || id > 4095 || next.includes(id)) continue
    if (next.length >= MAX_BATCH) {
      capped = true
      break
    }
    next.push(id)
  }
  return { ids: next, capped }
}

export function pixelsOnLine(from: number, to: number) {
  const size = 64
  let x0 = from % size
  let y0 = Math.floor(from / size)
  const x1 = to % size
  const y1 = Math.floor(to / size)
  const line: number[] = []
  const dx = Math.abs(x1 - x0)
  const dy = Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let err = dx - dy
  while (true) {
    line.push(y0 * size + x0)
    if (x0 === x1 && y0 === y1) break
    const doubled = err * 2
    if (doubled > -dy) {
      err -= dy
      x0 += sx
    }
    if (doubled < dx) {
      err += dx
      y0 += sy
    }
  }
  return line
}

export function samePixelIds(left: readonly number[], right: readonly number[]) {
  return left.length === right.length && left.every((id, index) => id === right[index])
}

export function staleBatchIds(
  ids: readonly number[],
  cachedAt: ReadonlyMap<number, number>,
  now: number,
  ttlMs: number,
) {
  return ids.filter((id) => {
    const at = cachedAt.get(id)
    return at === undefined || now - at >= ttlMs
  })
}

export function batchPricesMatch(confirmed: readonly bigint[], fresh: readonly bigint[]) {
  return confirmed.length === fresh.length
    && confirmed.every((price, index) => price === fresh[index])
}
