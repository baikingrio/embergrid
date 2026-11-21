import type { Ref } from 'vue'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import type { PrivateKeyAccount } from 'viem/accounts'
import type { Hex } from 'viem'

const STORAGE_KEY = 'embergrid.demo.pk'
const ACK_KEY = 'embergrid.demo.ack'

type DemoWallet = {
  account: Ref<PrivateKeyAccount | null>
  acknowledged: Ref<boolean>
  ready: Ref<boolean>
  acknowledge: () => void
  copyAddress: () => Promise<void>
  copied: Ref<boolean>
}

let shared: DemoWallet | null = null

export function useDemoWallet(): DemoWallet {
  if (shared) return shared

  const account = ref<PrivateKeyAccount | null>(null)
  const acknowledged = ref(true)
  const ready = ref(false)
  const copied = ref(false)

  function load() {
    let stored = localStorage.getItem(STORAGE_KEY) as Hex | null
    if (!stored) {
      stored = generatePrivateKey()
      localStorage.setItem(STORAGE_KEY, stored)
      localStorage.removeItem(ACK_KEY)
    }
    acknowledged.value = localStorage.getItem(ACK_KEY) === '1'
    account.value = privateKeyToAccount(stored)
    ready.value = true
  }

  function acknowledge() {
    localStorage.setItem(ACK_KEY, '1')
    acknowledged.value = true
  }

  async function copyAddress() {
    if (!account.value) return
    await navigator.clipboard.writeText(account.value.address)
    copied.value = true
    window.setTimeout(() => {
      copied.value = false
    }, 1500)
  }

  onMounted(load)

  shared = { account, acknowledged, ready, acknowledge, copyAddress, copied }
  return shared
}
