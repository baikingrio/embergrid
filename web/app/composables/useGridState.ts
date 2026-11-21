import { formatEther, zeroAddress, type Address, type Hex } from 'viem'
import { EMBERGRID_ADDRESS, MONAD_TESTNET_EXPLORER, createMonadPublicClient } from '@embergrid/shared'
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
  const balance = ref(0n)
  const pending = ref(0n)
  const trades = ref<TradeRow[]>([])
  const loading = ref(true)
  const synced = ref(false)
  const loadError = ref<string | null>(null)

  function bump() {
    revision.value += 1
  }

  async function syncCanvas() {
    const nextColors = new Uint8Array(PIXEL_COUNT)
    const nextOwned = new Uint8Array(PIXEL_COUNT)
    const pages = await Promise.all(Array.from({ length: PIXEL_COUNT / PAGE }, (_, page) => {
      const start = page * PAGE
      return publicClient.readContract({
        address: EMBERGRID_ADDRESS,
        abi: embergridAbi,
        functionName: 'getPixels',
        args: [BigInt(start), BigInt(PAGE)],
      }).then((result) => ({ start, result }))
    }))
    for (const { start, result } of pages) {
      const [owners, , pageColors] = result
      for (let i = 0; i < PAGE; i++) {
        nextColors[start + i] = pageColors[i] ?? 0
        nextOwned[start + i] = owners[i] && owners[i] !== zeroAddress ? 1 : 0
      }
    }
    colors.value = nextColors
    owned.value = nextOwned
    bump()
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
  }

  async function syncAccount() {
    const address = account.value?.address
    if (!address) return
    const [native, credit] = await Promise.all([
      publicClient.getBalance({ address }),
      publicClient.readContract({
        address: EMBERGRID_ADDRESS,
        abi: embergridAbi,
        functionName: 'pendingWithdrawals',
        args: [address],
      }),
    ])
    balance.value = native
    pending.value = credit
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

  function installWatchers() {
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
    poll = window.setInterval(() => {
      void syncRound().then(() => syncAccount()).catch(() => {})
    }, 15_000)
    canvasPoll = window.setInterval(() => {
      void syncCanvas().catch(() => {})
    }, 60_000)
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
    stopWatch?.()
    if (poll) window.clearInterval(poll)
    if (canvasPoll) window.clearInterval(canvasPoll)
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
    awaitingSettle,
    winnerCredit,
    rollover,
    balance,
    pending,
    trades,
    loading,
    synced,
    loadError,
    sync,
    retry: session.retry,
    syncAccount,
    applyPaint,
    txUrl,
    formatEther,
  }
}
