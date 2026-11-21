import {
  createWalletClient,
  formatEther,
  http,
  zeroAddress,
  type Address,
  type Hex,
} from 'viem'
import { EMBERGRID_ADDRESS, createMonadPublicClient, monadTestnet } from '@embergrid/shared'
import { embergridAbi } from '~/lib/embergridAbi'

export type PaintQuote = {
  pixelId: number
  color: number
  owner: Address
  nextPrice: bigint
  previousCredit: bigint
  poolDelta: bigint
}

const ZERO = zeroAddress

export function usePaintSession() {
  const config = useRuntimeConfig()
  const { account } = useDemoWallet()
  const publicClient = createMonadPublicClient(config.public.monadRpcUrl)

  const pixelId = ref(0)
  const color = ref(1)
  const quote = ref<PaintQuote | null>(null)
  const confirmedPrice = ref<bigint | null>(null)
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
      transport: http(config.public.monadRpcUrl),
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

  async function fetchQuote() {
    const id = pixelId.value
    if (!Number.isInteger(id) || id < 0 || id > 4095) {
      message.value = '像素编号需在 0 到 4095'
      quote.value = null
      confirmedPrice.value = null
      return
    }
    const [owner, nextPrice, previousCredit] = await publicClient.readContract({
      address: EMBERGRID_ADDRESS,
      abi: embergridAbi,
      functionName: 'quotePaint',
      args: [BigInt(id)],
    })
    const poolDelta = owner === ZERO ? nextPrice : nextPrice - previousCredit
    quote.value = {
      pixelId: id,
      color: color.value,
      owner,
      nextPrice,
      previousCredit,
      poolDelta,
    }
    confirmedPrice.value = null
    optimisticColor.value = null
    status.value = 'idle'
    message.value = owner === ZERO ? '首次购买，支付金额全部进入奖池' : '请确认金额后再发送'
    txHash.value = null
    await readChainColor(id)
  }

  function confirmQuote() {
    if (!quote.value || heldByMe.value) return
    confirmedPrice.value = quote.value.nextPrice
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
      message.value = error instanceof Error ? error.message : '提现失败'
    } finally {
      inflight.value = false
    }
  }

  async function sendPaint() {
    if (inflight.value || !quote.value || confirmedPrice.value === null) return
    if (heldByMe.value) return
    inflight.value = true
    status.value = 'pending'
    optimisticColor.value = quote.value.color
    message.value = '交易待确认'
    try {
      const fresh = await publicClient.readContract({
        address: EMBERGRID_ADDRESS,
        abi: embergridAbi,
        functionName: 'quotePaint',
        args: [BigInt(quote.value.pixelId)],
      })
      if (fresh[1] !== confirmedPrice.value) {
        quote.value = {
          ...quote.value,
          owner: fresh[0],
          nextPrice: fresh[1],
          previousCredit: fresh[2],
          poolDelta: fresh[0] === ZERO ? fresh[1] : fresh[1] - fresh[2],
        }
        confirmedPrice.value = null
        optimisticColor.value = null
        status.value = 'failed'
        message.value = '价格已变化，请重新确认'
        return
      }

      const hash = await walletClient().writeContract({
        address: EMBERGRID_ADDRESS,
        abi: embergridAbi,
        functionName: 'paint',
        args: [BigInt(quote.value.pixelId), quote.value.color],
        value: confirmedPrice.value,
      })
      txHash.value = hash
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      if (receipt.status !== 'success') {
        throw new Error('交易失败')
      }
      await fetchQuote()
      status.value = 'confirmed'
      message.value = '已在链上确认'
      confirmedPrice.value = null
    } catch (error) {
      optimisticColor.value = null
      status.value = 'failed'
      message.value = error instanceof Error ? error.message : '交易失败，已恢复链上颜色'
      if (quote.value) await readChainColor(quote.value.pixelId)
    } finally {
      inflight.value = false
    }
  }

  return {
    pixelId,
    color,
    quote,
    confirmedPrice,
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
    formatEther,
  }
}
