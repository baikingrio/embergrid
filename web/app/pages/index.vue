<script setup lang="ts">
import { MONAD_TESTNET_CHAIN_ID } from '@monad-place/shared'

const config = useRuntimeConfig()

useMonadClient()

const chainId = MONAD_TESTNET_CHAIN_ID
const rpcUrl = config.public.monadRpcUrl
</script>

<template>
  <main class="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
    <h1 class="text-4xl font-bold tracking-tight text-gray-900">
      Monad Place
    </h1>
    <p class="text-lg text-gray-600">
      Chain ID:
      <span class="font-mono font-semibold text-violet-600">{{ chainId }}</span>
    </p>
    <p class="max-w-md truncate text-sm text-gray-500">
      RPC: {{ rpcUrl }}
    </p>
  </main>
</template>