import { createMonadPublicClient } from '@embergrid/shared'

export function useMonadClient() {
  const config = useRuntimeConfig()

  return createMonadPublicClient(config.public.monadRpcUrl)
}