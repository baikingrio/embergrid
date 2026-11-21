import { createMonadPublicClient } from '@monad-place/shared'

export function useMonadClient() {
  const config = useRuntimeConfig()

  return createMonadPublicClient(config.public.monadRpcUrl)
}