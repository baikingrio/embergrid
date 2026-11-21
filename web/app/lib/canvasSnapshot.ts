export type CanvasSnapshot = {
  blockNumber: string
  updatedAt: number
  colors: number[]
  owned: number[]
}

export function mergeCanvasSnapshot(
  snapshot: Pick<CanvasSnapshot, 'colors' | 'owned'>,
  pins: ReadonlyMap<number, number>,
) {
  const count = snapshot.colors.length
  const colors = new Uint8Array(count)
  const owned = new Uint8Array(count)
  const released: number[] = []
  for (let id = 0; id < count; id += 1) {
    const pin = pins.get(id)
    const chainColor = snapshot.colors[id] ?? 0
    const chainOwned = snapshot.owned[id] ? 1 : 0
    if (pin === undefined) {
      colors[id] = chainColor
      owned[id] = chainOwned
      continue
    }
    if (chainOwned && chainColor === pin) {
      colors[id] = chainColor
      owned[id] = 1
      released.push(id)
      continue
    }
    colors[id] = pin
    owned[id] = 1
  }
  return { colors, owned, released }
}

export function createSnapshotCache<T>(ttlMs: number) {
  let cached: { at: number, data: T } | null = null
  let flight: Promise<T> | null = null

  return {
    async get(load: () => Promise<T>, now = Date.now()) {
      if (cached && now - cached.at < ttlMs) return cached.data
      if (flight) return flight
      flight = load()
        .then((data) => {
          cached = { at: now, data }
          return data
        })
        .finally(() => {
          flight = null
        })
      return flight
    },
  }
}
