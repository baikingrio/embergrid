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

export function samePixelIds(left: readonly number[], right: readonly number[]) {
  return left.length === right.length && left.every((id, index) => id === right[index])
}

export function batchPricesMatch(confirmed: readonly bigint[], fresh: readonly bigint[]) {
  return confirmed.length === fresh.length
    && confirmed.every((price, index) => price === fresh[index])
}
