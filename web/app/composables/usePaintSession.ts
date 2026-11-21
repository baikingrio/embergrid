import {
  createWalletClient,
  formatEther,
  parseEventLogs,
  zeroAddress,
  type Address,
  type Hex,
} from 'viem'
import { EMBERGRID_ADDRESS, createMonadPublicClient, monadTestnet, monadTransport } from '@embergrid/shared'
import { addBatchIds as includeBatchIds, batchPricesMatch, samePixelIds, staleBatchIds, toggleBatchId } from '~/lib/batchSelection'
import { embergridAbi } from '~/lib/embergridAbi'
import { PALETTE } from '~/lib/palette'
import { createQuoteRequests } from '~/lib/quoteRequests'

export type PaintQuote = {
  pixelId: number
  color: number
  owner: Address
  nextPrice: bigint
  previousCredit: bigint
  poolDelta: bigint
}

const ZERO = zeroAddress

function explain(error: unknown, fallback: string) {
  const text = error instanceof Error ? error.message : ''
  if (text.includes('RoundAwaitingSettle')) return '本轮已到期，请先结算后再购买'
  if (text.includes('CannotBuyOwnPixel')) return '不能购买自己持有的像素'
  if (text.includes('IncorrectPayment')) return '价格已变化，请重新确认'
  if (text.includes('NothingToWithdraw')) return '没有可领取余额'
  if (text.includes('InvalidBatch') || text.includes('DuplicatePixelId')) return '批量不合法，整笔未上链'
  if (text.includes('429') || text.includes('Rate limit')) return '公共节点繁忙，请稍后再点一次'
  return text || fallback
}

export function usePaintSession() {
  const config = useRuntimeConfig()
  const { account } = useDemoWallet()
  const publicClient = createMonadPublicClient(config.public.monadRpcUrl)

  const pixelId = ref(0)
  const color = ref(1)
  watch(() => account.value?.address, (address) => {
    if (!address) return
    const saved = localStorage.getItem(`embergrid.paint-color.${address.toLowerCase()}`)
    const index = saved === null ? NaN : Number(saved)
    color.value = Number.isInteger(index) && index >= 0 && index < PALETTE.length
      ? index
      : Number.parseInt(address.slice(-8), 16) % PALETTE.length
  }, { immediate: true })
  const quote = ref<PaintQuote | null>(null)
  const confirmedPrice = ref<bigint | null>(null)
  const confirmedPixelId = ref<number | null>(null)
  const quoting = ref(false)
  const inflight = ref(false)
  const status = ref<'idle' | 'pending' | 'confirmed' | 'failed'>('idle')
  const message = ref('')
  const chainColor = ref<number | null>(null)
  const optimisticColor = ref<number | null>(null)
  const txHash = ref<Hex | null>(null)
  const batchIds = ref<number[]>([])
  const batchQuotes = ref<PaintQuote[]>([])
  const batchQuoting = shallowRef(false)
  const confirmedBatch = ref<{ ids: number[], prices: bigint[], color: number, total: bigint } | null>(null)
  const pendingPaints = ref<{ id: number, color: number }[]>([])
  const settleResult = ref<{ winner: Address, credit: bigint, rollover: bigint } | null>(null)
  const batchQuoteCache = new Map<number, { quote: PaintQuote, at: number }>()
  const batchQuoteTtlMs = 20_000
  let batchTicket = 0

  const heldByMe = computed(() => {
    if (!quote.value || !account.value) return false
    return quote.value.owner.toLowerCase() === account.value.address.toLowerCase()
  })

  const displayColor = computed(() => optimisticColor.value ?? chainColor.value)
  const batchTotal = computed(() => batchQuotes.value.reduce((sum, item) => sum + item.nextPrice, 0n))
  const batchIncludesMine = computed(() => {
    const mine = account.value?.address.toLowerCase()
    if (!mine) return false
    return batchQuotes.value.some((item) => item.owner.toLowerCase() === mine)
  })
  const batchReady = computed(() => {
    const confirmed = confirmedBatch.value
    if (!confirmed) return false
    return confirmed.color === color.value && samePixelIds(confirmed.ids, batchIds.value)
  })

  function walletClient() {
    if (!account.value) throw new Error('钱包尚未就绪')
    return createWalletClient({
      account: account.value,
      chain: monadTestnet,
      transport: monadTransport(config.public.monadRpcUrl),
    })
  }

  async function readChainColor(id: number) {
    const pixel = await publicClient.readContract({
      address: EMBERGRID_ADDRESS,
      abi: embergridAbi,
      functionName: 'pixels',
      args: [BigInt(id)],
    })
    chainColor.value = pixel[2]
  }

  function toQuote(id: number, owner: Address, nextPrice: bigint, previousCredit: bigint, paintColor: number): PaintQuote {
    return {
      pixelId: id,
      color: paintColor,
      owner,
      nextPrice,
      previousCredit,
      poolDelta: owner === ZERO ? nextPrice : nextPrice - previousCredit,
    }
  }

  async function readQuote(id: number) {
    const [owner, nextPrice, previousCredit] = await publicClient.readContract({
      address: EMBERGRID_ADDRESS,
      abi: embergridAbi,
      functionName: 'quotePaint',
      args: [BigInt(id)],
    })
    return { owner, nextPrice, previousCredit }
  }

  function clearPending() {
    optimisticColor.value = null
    pendingPaints.value = []
  }

  const quotes = createQuoteRequests()

  function clearConfirmation() {
    confirmedPrice.value = null
    confirmedPixelId.value = null
  }

  async function fetchQuote() {
    const id = pixelId.value
    if (!Number.isInteger(id) || id < 0 || id > 4095) {
      message.value = '像素编号需在 0 到 4095'
      quote.value = null
      clearConfirmation()
      return
    }
    const ticket = quotes.start(id)
    quote.value = null
    clearConfirmation()
    quoting.value = true
    message.value = '正在报价…'
    try {
      const priced = await readQuote(id)
      if (!ticket.isCurrent(pixelId.value)) return
      quote.value = toQuote(id, priced.owner, priced.nextPrice, priced.previousCredit, color.value)
      clearPending()
      status.value = 'idle'
      message.value = priced.owner === ZERO ? '首次购买，支付金额全部进入奖池' : '请确认金额后再发送'
      txHash.value = null
      await readChainColor(id)
    } catch (error) {
      if (!ticket.isCurrent(pixelId.value)) return
      quote.value = null
      message.value = explain(error, '报价读取失败')
    } finally {
      if (ticket.isCurrent(pixelId.value)) quoting.value = false
    }
  }

  function confirmQuote() {
    if (quoting.value || !quote.value || quote.value.pixelId !== pixelId.value || heldByMe.value) return
    confirmedPrice.value = quote.value.nextPrice
    confirmedPixelId.value = quote.value.pixelId
    quote.value = { ...quote.value, color: color.value }
    message.value = `已确认 ${formatEther(quote.value.nextPrice)} MON，可发送`
  }

  function clearBatchConfirmation() {
    confirmedBatch.value = null
  }

  watch(color, (next) => {
    const address = account.value?.address
    if (address) localStorage.setItem(`embergrid.paint-color.${address.toLowerCase()}`, String(next))
    clearConfirmation()
    clearBatchConfirmation()
    if (quote.value) quote.value = { ...quote.value, color: next }
    batchQuotes.value = batchQuotes.value.map((item) => ({ ...item, color: next }))
  })

  function toggleBatch(id: number) {
    const next = toggleBatchId(batchIds.value, id)
    if (next.error) {
      message.value = next.error
      return
    }
    batchIds.value = next.ids
    void fetchBatchQuotes()
  }

  function addBatchIds(incoming: number[]) {
    const next = includeBatchIds(batchIds.value, incoming)
    if (samePixelIds(next.ids, batchIds.value)) {
      if (next.capped) message.value = '批量最多 64 格'
      return
    }
    batchIds.value = next.ids
    clearBatchConfirmation()
    if (next.capped) message.value = '批量最多 64 格'
  }

  function clearBatch() {
    batchTicket += 1
    batchIds.value = []
    batchQuotes.value = []
    clearBatchConfirmation()
    batchQuoting.value = false
  }

  function rememberBatchQuote(id: number, quoteForPixel: PaintQuote, at: number) {
    batchQuoteCache.set(id, { quote: quoteForPixel, at })
  }

  function cachedBatchQuotes(ids: number[], now: number) {
    const cachedAt = new Map([...batchQuoteCache].map(([id, entry]) => [id, entry.at]))
    const missing = staleBatchIds(ids, cachedAt, now, batchQuoteTtlMs)
    const quotesForIds = ids.flatMap((id) => {
      if (missing.includes(id)) return []
      const hit = batchQuoteCache.get(id)
      return hit ? [{ ...hit.quote, color: color.value }] : []
    })
    return { missing, quotesForIds }
  }

  async function fetchBatchQuotes() {
    const ids = [...batchIds.value]
    const ticket = ++batchTicket
    clearBatchConfirmation()
    if (ids.length === 0) {
      batchQuotes.value = []
      batchQuoting.value = false
      return
    }
    const now = Date.now()
    const { missing, quotesForIds } = cachedBatchQuotes(ids, now)
    if (missing.length === 0) {
      batchQuotes.value = quotesForIds
      batchQuoting.value = false
      message.value = `已读取 ${ids.length} 格报价，确认后一次提交`
      return
    }
    batchQuotes.value = quotesForIds
    batchQuoting.value = true
    try {
      const priced = await Promise.all(missing.map((id) => readQuote(id)))
      if (ticket !== batchTicket || !samePixelIds(ids, batchIds.value)) return
      const stamped = Date.now()
      missing.forEach((id, index) => {
        const item = priced[index]
        if (!item) return
        rememberBatchQuote(id, toQuote(id, item.owner, item.nextPrice, item.previousCredit, color.value), stamped)
      })
      batchQuotes.value = cachedBatchQuotes(ids, stamped).quotesForIds
      message.value = `已读取 ${ids.length} 格报价，确认后一次提交`
    } catch (error) {
      if (ticket !== batchTicket) return
      batchQuotes.value = []
      message.value = explain(error, '批量报价读取失败')
    } finally {
      if (ticket === batchTicket) batchQuoting.value = false
    }
  }

  function confirmBatch() {
    if (
      batchQuoting.value
      || inflight.value
      || batchIncludesMine.value
      || batchQuotes.value.length === 0
      || !samePixelIds(batchQuotes.value.map((item) => item.pixelId), batchIds.value)
    ) return
    confirmedBatch.value = {
      ids: batchIds.value.slice(),
      prices: batchQuotes.value.map((item) => item.nextPrice),
      color: color.value,
      total: batchTotal.value,
    }
    message.value = `已确认批量 ${formatEther(batchTotal.value)} MON，共 ${batchIds.value.length} 格`
  }

  async function withdraw() {
    if (inflight.value || !account.value) return
    inflight.value = true
    status.value = 'pending'
    message.value = '提现待确认'
    try {
      const hash = await walletClient().writeContract({
        address: EMBERGRID_ADDRESS,
        abi: embergridAbi,
        functionName: 'withdraw',
      })
      txHash.value = hash
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      if (receipt.status !== 'success') throw new Error('提现失败')
      status.value = 'confirmed'
      message.value = '提现已确认'
    } catch (error) {
      status.value = 'failed'
      message.value = error instanceof Error ? explain(error, '提现失败') : '提现失败'
    } finally {
      inflight.value = false
    }
  }

  async function sendPaint() {
    const targetId = pixelId.value
    if (
      inflight.value
      || quoting.value
      || !quote.value
      || quote.value.pixelId !== targetId
      || confirmedPixelId.value !== targetId
      || confirmedPrice.value === null
      || heldByMe.value
    ) {
      return
    }
    const price = confirmedPrice.value
    const paintColor = quote.value.color
    inflight.value = true
    status.value = 'pending'
    pendingPaints.value = [{ id: targetId, color: paintColor }]
    optimisticColor.value = paintColor
    message.value = '交易待确认'
    try {
      if (pixelId.value !== targetId || confirmedPixelId.value !== targetId) {
        clearPending()
        status.value = 'idle'
        return
      }
      const fresh = await readQuote(targetId)
      if (pixelId.value !== targetId || confirmedPixelId.value !== targetId) {
        clearPending()
        status.value = 'idle'
        return
      }
      if (fresh.nextPrice !== price) {
        if (!quote.value || quote.value.pixelId !== targetId) {
          clearPending()
          status.value = 'idle'
          return
        }
        quote.value = toQuote(targetId, fresh.owner, fresh.nextPrice, fresh.previousCredit, paintColor)
        confirmedPrice.value = null
        confirmedPixelId.value = null
        clearPending()
        status.value = 'failed'
        message.value = '价格已变化，请重新确认'
        return
      }

      const hash = await walletClient().writeContract({
        address: EMBERGRID_ADDRESS,
        abi: embergridAbi,
        functionName: 'paint',
        args: [BigInt(targetId), paintColor],
        value: price,
      })
      txHash.value = hash
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      if (receipt.status !== 'success') {
        throw new Error('交易失败')
      }
      await fetchQuote()
      settleResult.value = null
      status.value = 'confirmed'
      message.value = '已在链上确认'
      clearConfirmation()
    } catch (error) {
      clearPending()
      status.value = 'failed'
      message.value = explain(error, '交易失败，已恢复链上颜色')
      if (quote.value) await readChainColor(quote.value.pixelId)
    } finally {
      inflight.value = false
    }
  }

  async function sendBatch() {
    const confirmed = confirmedBatch.value
    if (
      !confirmed
      || inflight.value
      || quoting.value
      || batchQuoting.value
      || !batchReady.value
      || confirmed.ids.length === 0
    ) return
    const ids = confirmed.ids.slice()
    const prices = confirmed.prices.slice()
    const paintColor = confirmed.color
    const total = confirmed.total
    inflight.value = true
    status.value = 'pending'
    pendingPaints.value = ids.map((id) => ({ id, color: paintColor }))
    message.value = '批量交易待确认'
    try {
      const fresh = await Promise.all(ids.map((id) => readQuote(id)))
      if (!confirmedBatch.value || !samePixelIds(ids, confirmedBatch.value.ids)) {
        clearPending()
        status.value = 'idle'
        return
      }
      const freshPrices = fresh.map((item) => item.nextPrice)
      const ownedByMe = fresh.some((item) => account.value && item.owner.toLowerCase() === account.value.address.toLowerCase())
      if (!batchPricesMatch(prices, freshPrices) || ownedByMe) {
        batchQuotes.value = fresh.map((item, index) => toQuote(ids[index] ?? 0, item.owner, item.nextPrice, item.previousCredit, paintColor))
        clearBatchConfirmation()
        clearPending()
        status.value = 'failed'
        message.value = '有像素价格变化或不能购买，整笔未发送'
        return
      }
      const hash = await walletClient().writeContract({
        address: EMBERGRID_ADDRESS,
        abi: embergridAbi,
        functionName: 'paintBatch',
        args: [ids, ids.map(() => paintColor)],
        value: total,
      })
      txHash.value = hash
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      if (receipt.status !== 'success') throw new Error('批量交易失败')
      clearBatch()
      clearPending()
      settleResult.value = null
      await fetchQuote()
      status.value = 'confirmed'
      message.value = `批量已在链上确认，共 ${ids.length} 格`
    } catch (error) {
      clearPending()
      status.value = 'failed'
      message.value = explain(error, '批量失败，链上画布未改变')
    } finally {
      inflight.value = false
    }
  }

  async function settleRound() {
    if (inflight.value || !account.value) return
    inflight.value = true
    status.value = 'pending'
    message.value = '结算待确认'
    try {
      const pool = await publicClient.readContract({
        address: EMBERGRID_ADDRESS,
        abi: embergridAbi,
        functionName: 'prizePool',
      })
      const credit = (pool * 80n) / 100n
      const hash = await walletClient().writeContract({
        address: EMBERGRID_ADDRESS,
        abi: embergridAbi,
        functionName: 'settleRound',
      })
      txHash.value = hash
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      if (receipt.status !== 'success') throw new Error('结算失败')
      const settled = parseEventLogs({
        abi: embergridAbi,
        logs: receipt.logs,
        eventName: 'RoundSettled',
      })[0]
      const winnerCredit = settled?.args.winnerCredit ?? credit
      const rollover = settled?.args.rollover ?? pool - credit
      const winner = settled?.args.winner ?? zeroAddress
      settleResult.value = { winner, credit: winnerCredit, rollover }
      status.value = 'confirmed'
      message.value = '结算完成。可以开启下一轮。'
    } catch (error) {
      status.value = 'failed'
      message.value = explain(error, '结算失败')
    } finally {
      inflight.value = false
    }
  }

  return {
    pixelId,
    color,
    quote,
    confirmedPrice,
    confirmedPixelId,
    quoting,
    inflight,
    status,
    message,
    displayColor,
    heldByMe,
    txHash,
    batchIds,
    batchQuotes,
    batchQuoting,
    batchTotal,
    batchIncludesMine,
    batchReady,
    pendingPaints,
    settleResult,
    fetchQuote,
    confirmQuote,
    toggleBatch,
    addBatchIds,
    fetchBatchQuotes,
    clearBatch,
    confirmBatch,
    sendPaint,
    sendBatch,
    withdraw,
    settleRound,
    formatEther,
  }
}
