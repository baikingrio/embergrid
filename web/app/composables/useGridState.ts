import { formatEther, zeroAddress, type Address, type Hex } from 'viem'
import { EMBERGRID_ADDRESS, MONAD_TESTNET_EXPLORER, createMonadPublicClient } from '@embergrid/shared'
import { mergeCanvasSnapshot, type CanvasSnapshot } from '~/lib/canvasSnapshot'
import { embergridAbi } from '~/lib/embergridAbi'
import { createGridSyncController } from '~/lib/gridSync'
import { selectCanvasUpdates, type CanvasUpdates, type CanvasPaint } from '~/lib/canvasUpdates'
import { publishRoundSnapshot } from '~/lib/roundSnapshot'

export type TradeRow = {
  hash: Hex
  blockNumber: string
  logIndex: number
  pixelId: number
  color: number
  payment: bigint
  painter: Address
}

const PIXEL_COUNT = 4096
const PAGE = 256

export function useGridState() {
  const config = useRuntimeConfig()
  const { account } = useDemoWallet()
  const publicClient = createMonadPublicClient(config.public.monadRpcUrl)

  const colors = ref(new Uint8Array(PIXEL_COUNT))
  const owned = ref(new Uint8Array(PIXEL_COUNT))
  const revision = ref(0)
  const prizePool = ref(0n)
  const lastPainter = ref<Address>(zeroAddress)
  const endTime = ref(0)
  const chainNow = ref(0)
  const baseFee = ref(100_000_000_000n)
  const balance = ref(0n)
  const pending = ref(0n)
  const trades = ref<TradeRow[]>([])
  const loading = ref(true)
  const synced = ref(false)
  const loadError = ref<string | null>(null)
  const canvasBlock = ref('0')
  const canvasUpdatedAt = ref(0)
  const pins = new Map<number, { color: number, blockNumber: bigint }>()
  let paintCursor: bigint | null = null
  let accountFlight: Promise<void> | null = null
  let accountFlightAddress = ''

  function bump() {
    revision.value += 1
  }

  async function readCanvasFromChain(): Promise<CanvasSnapshot> {
    const blockNumber = await publicClient.getBlockNumber({ cacheTime: 0 })
    const pages = await Promise.all(Array.from({ length: PIXEL_COUNT / PAGE }, (_, page) => {
      const start = page * PAGE
      return publicClient.readContract({
        address: EMBERGRID_ADDRESS,
        abi: embergridAbi,
        functionName: 'getPixels',
        args: [BigInt(start), BigInt(PAGE)],
        blockNumber,
      }).then((result) => ({ start, result }))
    }))
    const snapshotColors = Array<number>(PIXEL_COUNT).fill(0)
    const snapshotOwned = Array<number>(PIXEL_COUNT).fill(0)
    for (const { start, result } of pages) {
      const [owners, , pageColors] = result
      for (let index = 0; index < PAGE; index += 1) {
        snapshotColors[start + index] = pageColors[index] ?? 0
        snapshotOwned[start + index] = owners[index] && owners[index] !== zeroAddress ? 1 : 0
      }
    }
    return {
      blockNumber: blockNumber.toString(),
      updatedAt: Date.now(),
      colors: snapshotColors,
      owned: snapshotOwned,
    }
  }

  function showSnapshot(snapshot: CanvasSnapshot) {
    const block = BigInt(snapshot.blockNumber)
    if (block < BigInt(canvasBlock.value)) return
    const merged = mergeCanvasSnapshot(snapshot, pins)
    for (const id of merged.released) pins.delete(id)
    colors.value = merged.colors
    owned.value = merged.owned
    canvasBlock.value = snapshot.blockNumber
    canvasUpdatedAt.value = snapshot.updatedAt
    if (paintCursor === null || block > paintCursor) paintCursor = block
    bump()
  }

  async function syncCanvas() {
    try {
      showSnapshot(await $fetch<CanvasSnapshot>('/api/canvas'))
    } catch {
      showSnapshot(await readCanvasFromChain())
    }
  }

  async function syncRound() {
    const [pool, painter, end, block] = await Promise.all([
      publicClient.readContract({
        address: EMBERGRID_ADDRESS,
        abi: embergridAbi,
        functionName: 'prizePool',
      }),
      publicClient.readContract({
        address: EMBERGRID_ADDRESS,
        abi: embergridAbi,
        functionName: 'lastPainter',
      }),
      publicClient.readContract({
        address: EMBERGRID_ADDRESS,
        abi: embergridAbi,
        functionName: 'endTime',
      }),
      publicClient.getBlock(),
    ])
    prizePool.value = pool
    lastPainter.value = painter
    endTime.value = Number(end)
    chainNow.value = Number(block.timestamp)
    publishRoundSnapshot({ lastPainter: painter, endTime: Number(end) })
    if (block.baseFeePerGas && block.baseFeePerGas > 0n) baseFee.value = block.baseFeePerGas
  }

  async function syncAccount() {
    const address = account.value?.address
    if (!address) return
    if (accountFlight && accountFlightAddress === address) return accountFlight
    accountFlightAddress = address
    accountFlight = (async () => {
      try {
        const [native, credit] = await Promise.all([
          publicClient.getBalance({ address }),
          publicClient.readContract({
            address: EMBERGRID_ADDRESS,
            abi: embergridAbi,
            functionName: 'pendingWithdrawals',
            args: [address],
          }),
        ])
        if (account.value?.address !== address) return
        balance.value = native
        pending.value = credit
      } finally {
        accountFlight = null
      }
    })()
    return accountFlight
  }

  async function syncTrades() {
    const latest = await publicClient.getBlockNumber()
    const fromBlock = latest > 3000n ? latest - 3000n : 0n
    const logs = await publicClient.getContractEvents({
      address: EMBERGRID_ADDRESS,
      abi: embergridAbi,
      eventName: 'Painted',
      fromBlock,
      toBlock: latest,
    })
    mergeTrades(logs
      .slice(-12)
      .reverse()
      .map((log) => ({
        hash: log.transactionHash,
        blockNumber: log.blockNumber.toString(),
        logIndex: log.logIndex,
        pixelId: Number(log.args.pixelId ?? 0n),
        color: Number(log.args.color ?? 0),
        payment: log.args.payment ?? 0n,
        painter: log.args.newOwner ?? zeroAddress,
      })))
  }

  function mergeTrades(incoming: TradeRow[]) {
    const unique = new Map<string, TradeRow>()
    for (const trade of [...trades.value, ...incoming]) unique.set(`${trade.hash}:${trade.logIndex}`, trade)
    trades.value = [...unique.values()].sort((a, b) => {
      const left = BigInt(a.blockNumber)
      const right = BigInt(b.blockNumber)
      return left === right ? b.logIndex - a.logIndex : left > right ? -1 : 1
    }).slice(0, 12)
  }

  async function sync() {
    await Promise.all([
      syncCanvas(),
      syncRound(),
      syncAccount(),
      syncTrades().catch(() => {}),
    ])
  }

  function applyPaints(paints: CanvasPaint[]) {
    if (!paints.length) return
    const nextColors = new Uint8Array(colors.value)
    const nextOwned = new Uint8Array(owned.value)
    for (const paint of paints) {
      pins.set(paint.pixelId, { color: paint.color, blockNumber: BigInt(paint.blockNumber) })
      nextColors[paint.pixelId] = paint.color
      nextOwned[paint.pixelId] = 1
    }
    colors.value = nextColors
    owned.value = nextOwned
    bump()
  }

  let poll = 0
  let canvasPoll = 0
  let updatesPoll = 0
  let liveGeneration = 0
  let updatesFlight: Promise<void> | null = null
  let updateFailures = 0
  let nextUpdatesAt = 0
  let lastDetailsSync = 0

  function stopPolling() {
    liveGeneration += 1
    if (poll) window.clearInterval(poll)
    if (canvasPoll) window.clearInterval(canvasPoll)
    if (updatesPoll) window.clearInterval(updatesPoll)
    poll = 0
    canvasPoll = 0
    updatesPoll = 0
  }

  async function readUpdates(): Promise<CanvasUpdates> {
    try {
      return await $fetch<CanvasUpdates>('/api/canvas-updates')
    } catch {
      // Stateless fallback also works when a provider does not support filters.
      const head = await publicClient.getBlockNumber({ cacheTime: 0 })
      const from = head > 31n ? head - 31n : 0n
      const logs = await publicClient.getContractEvents({
        address: EMBERGRID_ADDRESS,
        abi: embergridAbi,
        eventName: 'Painted',
        fromBlock: from,
        toBlock: head,
      })
      return {
        fromBlock: from.toString(),
        toBlock: head.toString(),
        paints: logs.filter((log) => !log.removed).map((log) => ({
          pixelId: Number(log.args.pixelId ?? 0n),
          color: Number(log.args.color ?? 0),
          blockNumber: log.blockNumber.toString(),
          logIndex: log.logIndex,
          hash: log.transactionHash,
          painter: log.args.newOwner ?? zeroAddress,
          payment: (log.args.payment ?? 0n).toString(),
        })),
      }
    }
  }

  function syncUpdates() {
    if (updatesFlight || paintCursor === null || document.hidden || Date.now() < nextUpdatesAt) return
    const generation = liveGeneration
    updatesFlight = (async () => {
      try {
        const batch = await readUpdates()
        if (generation !== liveGeneration) return
        let selected = selectCanvasUpdates(batch, paintCursor!)
        if (selected.gap) {
          // A resumed tab can be outside the recent log window. Read one fresh,
          // block-pinned snapshot before advancing; never skip the missing range.
          const snapshot = await readCanvasFromChain()
          if (generation !== liveGeneration) return
          showSnapshot(snapshot)
          selected = selectCanvasUpdates(batch, paintCursor!)
        }
        if (selected.gap) return
        applyPaints(selected.paints)
        mergeTrades(selected.paints.map((paint) => ({
          ...paint,
          payment: BigInt(paint.payment),
        })))
        paintCursor = selected.cursor
        updateFailures = 0
        nextUpdatesAt = 0
        if (selected.paints.length && Date.now() - lastDetailsSync >= 5_000) {
          lastDetailsSync = Date.now()
          void syncRound().then(syncAccount).catch(() => {})
        }
      } catch {
        if (generation !== liveGeneration) return
        updateFailures += 1
        nextUpdatesAt = Date.now() + Math.min(15_000, 1_000 * 2 ** updateFailures)
      } finally {
        updatesFlight = null
      }
    })()
  }

  function startPolling() {
    stopPolling()
    if (document.hidden) return
    updateFailures = 0
    nextUpdatesAt = 0
    syncUpdates()
    updatesPoll = window.setInterval(syncUpdates, 1_000)
    const jitter = Math.floor(Math.random() * 2_000)
    poll = window.setInterval(() => {
      void syncRound().then(() => syncAccount()).catch(() => {})
    }, 15_000 + jitter)
    canvasPoll = window.setInterval(() => {
      void syncCanvas().catch(() => {})
    }, 60_000 + jitter)
  }

  function onVisibility() {
    if (document.hidden) {
      stopPolling()
      return
    }
    void sync().catch(() => {})
    startPolling()
  }

  function installWatchers() {
    document.addEventListener('visibilitychange', onVisibility)
    startPolling()
  }

  const session = createGridSyncController({
    sync,
    installWatchers,
    schedule(fn, ms) {
      const id = window.setTimeout(fn, ms)
      return { cancel() { window.clearTimeout(id) } }
    },
  })

  function pullSession() {
    const snap = session.snapshot()
    loading.value = snap.loading
    synced.value = snap.synced
    loadError.value = snap.error
  }

  onMounted(() => {
    session.subscribe(pullSession)
    session.start()
  })

  onScopeDispose(() => {
    session.dispose()
    document.removeEventListener('visibilitychange', onVisibility)
    stopPolling()
  })

  watch(() => account.value?.address, () => {
    void syncAccount()
  })

  function txUrl(hash: Hex) {
    return `${MONAD_TESTNET_EXPLORER}/tx/${hash}`
  }

  const awaitingSettle = computed(() =>
    lastPainter.value !== zeroAddress && endTime.value > 0 && chainNow.value >= endTime.value,
  )
  const settlerCredit = computed(() => (prizePool.value * 1n) / 100n)
  const winnerCredit = computed(() => {
    const remainder = prizePool.value - settlerCredit.value
    return (remainder * 80n) / 100n
  })
  const rollover = computed(() => prizePool.value - settlerCredit.value - winnerCredit.value)

  return {
    colors,
    owned,
    revision,
    prizePool,
    lastPainter,
    endTime,
    chainNow,
    baseFee,
    awaitingSettle,
    settlerCredit,
    winnerCredit,
    rollover,
    balance,
    pending,
    trades,
    loading,
    synced,
    loadError,
    canvasBlock,
    canvasUpdatedAt,
    sync,
    retry: session.retry,
    syncAccount,
    applyPaints,
    txUrl,
    formatEther,
  }
}
