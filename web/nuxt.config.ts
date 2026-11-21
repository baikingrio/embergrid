import {
  MONAD_TESTNET_CHAIN_ID,
  MONAD_TESTNET_RPC_URL,
} from '@monad-place/shared'

export default defineNuxtConfig({
  ssr: false,
  modules: ['@nuxtjs/tailwindcss'],
  compatibilityDate: '2025-11-01',
  devtools: { enabled: true },
  runtimeConfig: {
    public: {
      monadRpcUrl:
        process.env.NUXT_PUBLIC_MONAD_RPC_URL ?? MONAD_TESTNET_RPC_URL,
      monadChainId: Number(
        process.env.NUXT_PUBLIC_MONAD_CHAIN_ID ?? MONAD_TESTNET_CHAIN_ID,
      ),
    },
  },
  transpile: ['@monad-place/shared'],
})