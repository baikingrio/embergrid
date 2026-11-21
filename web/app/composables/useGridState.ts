import { formatEther, zeroAddress, type Address, type Hex } from 'viem'
import { EMBERGRID_ADDRESS, MONAD_TESTNET_EXPLORER, createMonadPublicClient } from '@embergrid/shared'
import { mergeCanvasSnapshot, type CanvasSnapshot } from '~/lib/canvasSnapshot'
import { embergridAbi } from '~/lib/embergridAbi'
import { createGridSyncController } from '~/lib/gridSync'

export type TradeRow = {
  hash: Hex
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
  const pins = new Map<number, number>()
  let accountFlight: Promise<void> | null = null
  let accountFlightAddress = ''

  function bump() {
    revision.value += 1
  }

  async function readCanvasFromChain(): Promise<CanvasSnapshot> {
    const [blockNumber, pages] = await Promise.all([
      publicClient.getBlockNumber(),
      Promise.all(Array.from({ length: PIXEL_COUNT / PAGE }, (_, page) => {
        const start = page * PAGE
        return publicClient.readContract({
          address: EMBERGRID_ADDRESS,
          abi: embergridAbi,
          functionName: 'getPixels',
          args: [BigInt(start), BigInt(PAGE)],
        }).then((result) => ({ start, result }))
      })),
    ])
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
    const merged = mergeCanvasSnapshot(snapshot, pins)
    for (const id of merged.released) pins.delete(id)
    colors.value = merged.colors
    owned.value = merged.owned
    canvasBlock.value = snapshot.blockNumber
    canvasUpdatedAt.value = snapshot.updatedAt
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
    trades.value = logs
      .slice(-12)
      .reverse()
      .map((log) => ({
        hash: log.transactionHash,
        pixelId: Number(log.args.pixelId ?? 0n),
        color: Number(log.args.color ?? 0),
        payment: log.args.payment ?? 0n,
        painter: log.args.newOwner ?? zeroAddress,
      }))
  }

  async function sync() {
    await Promise.all([
      syncCanvas(),
      syncRound(),
      syncAccount(),
      syncTrades().catch(() => {}),
    ])
  }

  function applyPaint(pixelId: number, color: number) {
    pins.set(pixelId, color)
    const nextColors = new Uint8Array(colors.value)
    const nextOwned = new Uint8Array(owned.value)
    nextColors[pixelId] = color
    nextOwned[pixelId] = 1
    colors.value = nextColors
    owned.value = nextOwned
    bump()
  }

  let stopWatch: (() => void) | undefined
  let poll = 0
  let canvasPoll = 0

  function stopPolling() {
    if (poll) window.clearInterval(poll)
    if (canvasPoll) window.clearInterval(canvasPoll)
    poll = 0
    canvasPoll = 0
  }

  function watchPaints() {
    stopWatch?.()
    stopWatch = publicClient.watchContractEvent({
      address: EMBERGRID_ADDRESS,
      abi: embergridAbi,
      eventName: 'Painted',
      pollingInterval: 15_000,
      onLogs(logs) {
        for (const log of logs) {
          const id = Number(log.args.pixelId ?? 0n)
          applyPaint(id, Number(log.args.color ?? 0))
          if (log.transactionHash && log.args.newOwner) {
            trades.value = [
              {
                hash: log.transactionHash,
                pixelId: id,
                color: Number(log.args.color ?? 0),
                payment: log.args.payment ?? 0n,
                painter: log.args.newOwner,
              },
              ...trades.value,
            ].slice(0, 12)
          }
        }
        void syncRound().catch(() => {})
      },
    })
  }

  function startPolling() {
    stopPolling()
    stopWatch?.()
    stopWatch = undefined
    if (document.hidden) return
    watchPaints()
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
      stopWatch?.()
      stopWatch = undefined
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
    stopWatch?.()
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
  const winnerCredit = computed(() => (prizePool.value * 80n) / 100n)
  const rollover = computed(() => prizePool.value - winnerCredit.value)

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
    applyPaint,
    txUrl,
    formatEther,
  }
}
