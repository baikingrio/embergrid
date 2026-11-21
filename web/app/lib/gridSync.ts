export type SyncSnapshot = {
  loading: boolean
  synced: boolean
  error: string | null
  watchersInstalled: boolean
}

export function describeSyncError(error: unknown) {
  const text = error instanceof Error ? error.message : String(error)
  if (text.includes('429') || text.toLowerCase().includes('rate limit')) {
    return '公共节点繁忙，正在重试'
  }
  return '无法连接测试网'
}

export function backoffMs(attempt: number) {
  return Math.min(1000 * 2 ** attempt, 15_000)
}

export function createGridSyncController(deps: {
  sync: () => Promise<void>
  installWatchers: () => void
  schedule: (fn: () => void, ms: number) => { cancel: () => void }
}) {
  let loading = true
  let synced = false
  let error: string | null = null
  let watchersInstalled = false
  let attempt = 0
  let runToken = 0
  let disposed = false
  let retryTimer: { cancel: () => void } | null = null
  const listeners = new Set<() => void>()

  function snapshot(): SyncSnapshot {
    return { loading, synced, error, watchersInstalled }
  }

  function emit() {
    for (const listener of listeners) listener()
  }

  function installOnce() {
    if (watchersInstalled || disposed) return
    watchersInstalled = true
    deps.installWatchers()
  }

  async function run() {
    if (disposed) return
    const token = ++runToken
    try {
      await deps.sync()
      if (disposed || token !== runToken) return
      synced = true
      error = null
      attempt = 0
    } catch (caught) {
      if (disposed || token !== runToken) return
      synced = false
      error = describeSyncError(caught)
      const wait = backoffMs(attempt)
      attempt += 1
      retryTimer?.cancel()
      retryTimer = deps.schedule(() => {
        void run()
      }, wait)
    } finally {
      if (!disposed && token === runToken) {
        loading = false
        emit()
      }
    }
  }

  return {
    start() {
      installOnce()
      void run()
    },
    retry() {
      retryTimer?.cancel()
      attempt = 0
      loading = true
      emit()
      void run()
    },
    dispose() {
      disposed = true
      retryTimer?.cancel()
    },
    snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
