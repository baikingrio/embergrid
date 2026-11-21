<script setup lang="ts">
const wallet = useDemoWallet()
const paint = usePaintSession()

const shortAddress = computed(() => {
  const address = wallet.account.value?.address
  if (!address) return '生成中…'
  return `${address.slice(0, 6)}…${address.slice(-4)}`
})
</script>

<template>
  <main class="mx-auto flex min-h-screen max-w-lg flex-col gap-6 p-6">
    <header>
      <p class="text-xs font-semibold uppercase tracking-wide text-amber-700">测试网演示，使用测试 MON</p>
      <h1 class="text-3xl font-bold text-stone-900">EmberGrid 余烬格</h1>
      <p class="text-stone-600">像素领地上的最后一笔争夺</p>
    </header>

    <section v-if="wallet.ready.value && !wallet.acknowledged.value" class="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
      <p>这是保存在本机浏览器里的演示钱包。清除浏览器数据后将无法再访问该地址里的测试币。</p>
      <button class="mt-3 rounded bg-amber-800 px-3 py-1.5 text-white" type="button" @click="wallet.acknowledge()">
        我知道了
      </button>
    </section>

    <section class="flex items-center justify-between gap-3 rounded-lg border border-stone-200 p-4">
      <div>
        <p class="text-xs text-stone-500">演示地址</p>
        <p class="font-mono text-sm">{{ wallet.account.value?.address ?? shortAddress }}</p>
      </div>
      <button class="rounded border border-stone-300 px-3 py-1.5 text-sm" type="button" @click="wallet.copyAddress()">
        {{ wallet.copied.value ? '已复制' : '复制地址' }}
      </button>
    </section>

    <section class="grid grid-cols-2 gap-3">
      <label class="text-sm">
        像素编号
        <input v-model.number="paint.pixelId.value" class="mt-1 w-full rounded border px-2 py-1.5" type="number" min="0" max="4095">
      </label>
      <label class="text-sm">
        颜色 0–15
        <input v-model.number="paint.color.value" class="mt-1 w-full rounded border px-2 py-1.5" type="number" min="0" max="15">
      </label>
    </section>

    <button class="rounded bg-stone-900 px-4 py-2 text-white disabled:opacity-50" type="button" :disabled="paint.inflight.value" @click="paint.fetchQuote()">
      查询报价
    </button>

    <section v-if="paint.quote.value" class="space-y-2 rounded-lg border border-stone-200 p-4 text-sm">
      <p>下一口价：{{ paint.formatEther(paint.quote.value.nextPrice) }} MON</p>
      <p>前任预计回款：{{ paint.formatEther(paint.quote.value.previousCredit) }} MON</p>
      <p>奖池增量：{{ paint.formatEther(paint.quote.value.poolDelta) }} MON</p>
      <p v-if="paint.heldByMe.value" class="font-semibold text-amber-800">你已持有</p>
      <div class="flex gap-2">
        <button
          class="rounded border px-3 py-1.5 disabled:opacity-40"
          type="button"
          :disabled="paint.heldByMe.value || paint.inflight.value"
          @click="paint.confirmQuote()"
        >
          确认金额
        </button>
        <button
          class="rounded bg-orange-700 px-3 py-1.5 text-white disabled:opacity-40"
          type="button"
          :disabled="paint.confirmedPrice.value === null || paint.heldByMe.value || paint.inflight.value"
          @click="paint.sendPaint()"
        >
          {{ paint.inflight.value ? '等待回执…' : '购买' }}
        </button>
      </div>
    </section>

    <section class="flex items-center gap-3 text-sm">
      <span
        class="inline-block h-10 w-10 rounded border"
        :style="{ background: paint.displayColor.value === null ? '#e7e5e4' : `hsl(${paint.displayColor.value * 22} 70% 45%)` }"
      />
      <div>
        <p>{{ paint.message.value || '选择像素后查询报价' }}</p>
        <p v-if="paint.status.value === 'pending'" class="text-orange-700">待确认</p>
        <p v-else-if="paint.status.value === 'confirmed'" class="text-emerald-700">已确认</p>
        <p v-else-if="paint.status.value === 'failed'" class="text-red-700">失败，已按链上状态恢复</p>
      </div>
    </section>
  </main>
</template>
