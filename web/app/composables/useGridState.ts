import { formatEther, zeroAddress, type Address, type Hex } from 'viem'
import { EMBERGRID_ADDRESS, MONAD_TESTNET_EXPLORER, createMonadPublicClient } from '@embergrid/shared'
import { embergridAbi } from '~/lib/embergridAbi'

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

  function bump() {
    revision.value += 1
  }

  async function syncCanvas() {
    const nextColors = new Uint8Array(PIXEL_COUNT)
    const nextOwned = new Uint8Array(PIXEL_COUNT)
    for (let start = 0; start < PIXEL_COUNT; start += PAGE) {
      const [owners, , pageColors] = await publicClient.readContract({
        address: EMBERGRID_ADDRESS,
        abi: embergridAbi,
        functionName: 'getPixels',
        args: [BigInt(start), BigInt(PAGE)],
      })
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
    loading.value = false
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
  let roundPoll = 0

  onMounted(async () => {
    await sync()
    stopWatch = publicClient.watchContractEvent({
      address: EMBERGRID_ADDRESS,
      abi: embergridAbi,
      eventName: 'Painted',
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
        void syncRound()
      },
    })
    poll = window.setInterval(() => {
      void sync().catch(() => {})
    }, 12000)
    roundPoll = window.setInterval(() => {
      void syncRound().catch(() => {})
    }, 4000)
  })

  onScopeDispose(() => {
    stopWatch?.()
    if (poll) window.clearInterval(poll)
    if (roundPoll) window.clearInterval(roundPoll)
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
    sync,
    syncAccount,
    applyPaint,
    txUrl,
    formatEther,
  }
}
