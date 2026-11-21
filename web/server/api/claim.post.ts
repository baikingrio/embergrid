import { createWalletClient, isAddress, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { MONAD_POLLING_INTERVAL_MS, createMonadPublicClient, monadTestnet, monadTransport } from '@embergrid/shared'
import { describeFaucetFailure } from '../utils/faucetFailure'

const faucetAbi = [
  {
    type: 'function',
    name: 'drip',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'to', type: 'address' }],
    outputs: [],
  },
  { type: 'error', name: 'Cooldown', inputs: [] },
  { type: 'error', name: 'Insufficient', inputs: [] },
  { type: 'error', name: 'NotOwner', inputs: [] },
  { type: 'error', name: 'TransferFailed', inputs: [] },
] as const

export default defineEventHandler(async (event) => {
  const body = await readBody<{ address?: string }>(event)
  const address = body?.address
  if (!address || !isAddress(address)) {
    throw createError({ statusCode: 400, statusMessage: '地址无效' })
  }

  const config = useRuntimeConfig()
  const key = config.faucetPrivateKey
  const faucet = config.faucetAddress
  if (!key || !faucet || !isAddress(faucet)) {
    throw createError({ statusCode: 503, statusMessage: '水龙头还没备好' })
  }

  const account = privateKeyToAccount(key as Hex)
  const transport = monadTransport()
  const publicClient = createMonadPublicClient()
  const wallet = createWalletClient({ account, chain: monadTestnet, transport })

  try {
    const balance = await publicClient.getBalance({ address: account.address })
    if (balance === 0n) {
      throw createError({ statusCode: 503, statusMessage: '水龙头服务的 Gas 余额不足，请联系维护者补充测试 MON' })
    }
    const hash = await wallet.writeContract({
      address: faucet,
      abi: faucetAbi,
      functionName: 'drip',
      args: [address],
    })
    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
      pollingInterval: MONAD_POLLING_INTERVAL_MS,
    })
    if (receipt.status !== 'success') {
      throw createError({ statusCode: 500, statusMessage: '领取失败' })
    }
    return { hash }
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error
    throw createError(describeFaucetFailure(error))
  }
})
