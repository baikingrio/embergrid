import {
  createWalletClient,
  formatEther,
  zeroAddress,
  type Address,
  type Hex,
} from 'viem'
import { EMBERGRID_ADDRESS, createMonadPublicClient, monadTestnet, monadTransport } from '@embergrid/shared'
import { embergridAbi } from '~/lib/embergridAbi'
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
  if (text.includes('429') || text.includes('Rate limit')) return '公共节点繁忙，请稍后再点一次'
  return text || fallback
}

export function usePaintSession() {
  const config = useRuntimeConfig()
  const { account } = useDemoWallet()
  const publicClient = createMonadPublicClient(config.public.monadRpcUrl)

  const pixelId = ref(0)
  const color = ref(1)
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

  const heldByMe = computed(() => {
    if (!quote.value || !account.value) return false
    return quote.value.owner.toLowerCase() === account.value.address.toLowerCase()
  })

  const displayColor = computed(() => optimisticColor.value ?? chainColor.value)

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
      const [owner, nextPrice, previousCredit] = await publicClient.readContract({
        address: EMBERGRID_ADDRESS,
        abi: embergridAbi,
        functionName: 'quotePaint',
        args: [BigInt(id)],
      })
      if (!ticket.isCurrent(pixelId.value)) return
      const poolDelta = owner === ZERO ? nextPrice : nextPrice - previousCredit
      quote.value = {
        pixelId: id,
        color: color.value,
        owner,
        nextPrice,
        previousCredit,
        poolDelta,
      }
      optimisticColor.value = null
      status.value = 'idle'
      message.value = owner === ZERO ? '首次购买，支付金额全部进入奖池' : '请确认金额后再发送'
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
    optimisticColor.value = paintColor
    message.value = '交易待确认'
    try {
      if (pixelId.value !== targetId) return
      const fresh = await publicClient.readContract({
        address: EMBERGRID_ADDRESS,
        abi: embergridAbi,
        functionName: 'quotePaint',
        args: [BigInt(targetId)],
      })
      if (pixelId.value !== targetId || confirmedPixelId.value !== targetId) return
      if (fresh[1] !== price) {
        if (!quote.value || quote.value.pixelId !== targetId) return
        quote.value = {
          ...quote.value,
          owner: fresh[0],
          nextPrice: fresh[1],
          previousCredit: fresh[2],
          poolDelta: fresh[0] === ZERO ? fresh[1] : fresh[1] - fresh[2],
        }
        confirmedPrice.value = null
        confirmedPixelId.value = null
        optimisticColor.value = null
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
      status.value = 'confirmed'
      message.value = '已在链上确认'
      clearConfirmation()
    } catch (error) {
      optimisticColor.value = null
      status.value = 'failed'
      message.value = explain(error, '交易失败，已恢复链上颜色')
      if (quote.value) await readChainColor(quote.value.pixelId)
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
      status.value = 'confirmed'
      message.value = `结算完成。${formatEther(credit)} MON 已记入最后争夺者的可领取余额，余款留在奖池。可以开启下一轮。`
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
    fetchQuote,
    confirmQuote,
    sendPaint,
    withdraw,
    settleRound,
    formatEther,
  }
}
