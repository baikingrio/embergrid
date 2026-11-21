import {
  MONAD_TESTNET_CHAIN_ID,
  MONAD_TESTNET_RPC_URL,
} from '@embergrid/shared'

export default defineNuxtConfig({
  ssr: false,
  modules: ['@nuxtjs/tailwindcss'],
  compatibilityDate: '2025-11-01',
  devtools: { enabled: true },
  runtimeConfig: {
    public: {
      monadRpcUrl: MONAD_TESTNET_RPC_URL,
      monadChainId: MONAD_TESTNET_CHAIN_ID,
    },
  },
})