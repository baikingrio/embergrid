import {
  createPublicClient,
  defineChain,
  fallback,
  http,
  type Chain,
  type PublicClient,
} from 'viem'

export const MONAD_TESTNET_CHAIN_ID = 10143

export const MONAD_TESTNET_RPC_URL =
  'https://testnet-rpc.monad.xyz' as const

export const MONAD_TESTNET_RPC_URLS = [
  MONAD_TESTNET_RPC_URL,
  'https://rpc-testnet.monadinfra.com',
  'https://rpc.ankr.com/monad_testnet',
] as const

export const MONAD_TESTNET_EXPLORER = 'https://testnet.monadvision.com' as const

/** Receipt / block watch interval. Monad blocks far faster than viem's 4s default. */
export const MONAD_POLLING_INTERVAL_MS = 250

export const monadTestnet = defineChain({
  id: MONAD_TESTNET_CHAIN_ID,
  name: 'Monad Testnet',
  nativeCurrency: {
    decimals: 18,
    name: 'Monad',
    symbol: 'MON',
  },
  rpcUrls: {
    default: {
      http: [MONAD_TESTNET_RPC_URL],
    },
  },
  blockExplorers: {
    default: {
      name: 'MonadVision',
      url: MONAD_TESTNET_EXPLORER,
    },
  },
  testnet: true,
}) satisfies Chain

export function monadTransport(preferred?: string) {
  const urls = preferred
    ? [preferred, ...MONAD_TESTNET_RPC_URLS.filter((url) => url !== preferred)]
    : [...MONAD_TESTNET_RPC_URLS]
  return fallback(
    urls.map((url) => http(url, {
      batch: { batchSize: 20, wait: 0 },
      retryCount: 0,
      timeout: 20_000,
    })),
    { rank: false },
  )
}

export function createMonadPublicClient(
  rpcUrl: string = MONAD_TESTNET_RPC_URL,
): PublicClient {
  return createPublicClient({
    chain: monadTestnet,
    transport: monadTransport(rpcUrl),
    pollingInterval: MONAD_POLLING_INTERVAL_MS,
  })
}