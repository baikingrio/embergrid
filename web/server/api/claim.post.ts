import { createPublicClient, createWalletClient, isAddress, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { monadTestnet, monadTransport } from '@embergrid/shared'

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

function revertName(error: unknown) {
  let current: unknown = error
  for (let depth = 0; current && depth < 8; depth += 1) {
    if (typeof current !== 'object') return ''
    const record = current as { data?: { errorName?: string }, message?: string, cause?: unknown }
    if (record.data?.errorName) return record.data.errorName
    if (record.message?.includes('Insufficient')) return 'Insufficient'
    if (record.message?.includes('Cooldown')) return 'Cooldown'
    current = record.cause
  }
  return ''
}

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
  const publicClient = createPublicClient({ chain: monadTestnet, transport })
  const wallet = createWalletClient({ account, chain: monadTestnet, transport })

  try {
    const hash = await wallet.writeContract({
      address: faucet,
      abi: faucetAbi,
      functionName: 'drip',
      args: [address],
    })
    const receipt = await publicClient.waitForTransactionReceipt({ hash })
    if (receipt.status !== 'success') {
      throw createError({ statusCode: 500, statusMessage: '领取失败' })
    }
    return { hash }
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error
    const name = revertName(error)
    if (name === 'Cooldown') {
      throw createError({ statusCode: 429, statusMessage: '24 小时内已经领过' })
    }
    if (name === 'Insufficient') {
      throw createError({ statusCode: 503, statusMessage: '水龙头余额不足' })
    }
    throw createError({ statusCode: 500, statusMessage: '领取失败' })
  }
})
