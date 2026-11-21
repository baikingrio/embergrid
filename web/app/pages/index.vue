<script setup lang="ts">
import { PALETTE } from '~/lib/palette'
import { zeroAddress } from 'viem'

const wallet = useDemoWallet()
const paint = usePaintSession()
const grid = useGridState()
const now = ref(Date.now())

let clock = 0
onMounted(() => {
  clock = window.setInterval(() => {
    now.value = Date.now()
  }, 1000)
  void paint.fetchQuote()
})
onUnmounted(() => {
  if (clock) window.clearInterval(clock)
})

const countdown = computed(() => {
  if (!grid.synced.value) return '未同步'
  if (!grid.endTime.value) return '等待首笔'
  const seconds = Math.max(0, grid.endTime.value - Math.floor(now.value / 1000))
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return `${minutes}:${rest.toString().padStart(2, '0')}`
})

const lastPainterLabel = computed(() => {
  if (!grid.synced.value) return '未同步'
  const painter = grid.lastPainter.value
  if (!painter || painter === zeroAddress) return '尚无'
  return `${painter.slice(0, 6)}…${painter.slice(-4)}`
})

const pendingPixel = computed(() => {
  if (paint.status.value !== 'pending' || !paint.quote.value) return null
  return paint.quote.value.pixelId
})

function selectPixel(id: number) {
  if (paint.inflight.value) return
  paint.pixelId.value = id
  void paint.fetchQuote()
}

watch(() => paint.status.value, (status) => {
  if (status === 'confirmed') void grid.sync()
})

watch(() => grid.synced.value, (synced) => {
  if (synced) void paint.fetchQuote()
})

function short(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}
</script>

<template>
  <main class="mx-auto flex min-h-screen max-w-5xl flex-col gap-4 p-4">
    <header class="grid gap-3 rounded-lg border border-stone-200 p-4 md:grid-cols-4">
      <div class="md:col-span-1">
        <p class="text-xs font-semibold text-amber-700">测试网演示，使用测试 MON</p>
        <h1 class="text-2xl font-bold text-stone-900">EmberGrid 余烬格</h1>
        <p class="text-sm text-stone-600">像素领地上的最后一笔争夺</p>
      </div>
      <div>
        <p class="text-xs text-stone-500">奖池</p>
        <p class="font-mono text-lg">{{ grid.synced.value ? `${grid.formatEther(grid.prizePool.value)} MON` : '未同步' }}</p>
      </div>
      <div>
        <p class="text-xs text-stone-500">最后争夺者</p>
        <p class="font-mono text-lg">{{ lastPainterLabel }}</p>
      </div>
      <div>
        <p class="text-xs text-stone-500">画面倒计时</p>
        <p class="font-mono text-lg">{{ countdown }}</p>
        <p class="text-xs text-stone-400">以链上时间为准</p>
      </div>
    </header>

    <section v-if="grid.loadError.value" class="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-950">
      <p>连接测试网失败。{{ grid.loadError.value }} 默认的 0 不是链上结果。</p>
      <button class="mt-3 rounded bg-red-800 px-3 py-1.5 text-white" type="button" @click="grid.retry()">
        重试
      </button>
    </section>
    <section v-if="wallet.ready.value && !wallet.acknowledged.value" class="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
      <p>这是保存在本机浏览器里的演示钱包。清除浏览器数据后将无法再访问该地址里的测试币。</p>
      <button class="mt-3 rounded bg-amber-800 px-3 py-1.5 text-white" type="button" @click="wallet.acknowledge()">
        我知道了
      </button>
    </section>

    <div class="grid items-start gap-4 lg:grid-cols-[minmax(0,512px)_1fr]">
      <PixelCanvas
        :colors="grid.colors.value"
        :owned="grid.owned.value"
        :revision="grid.revision.value"
        :selected="paint.pixelId.value"
        :pending-id="pendingPixel"
        :pending-color="paint.status.value === 'pending' ? paint.color.value : null"
        @select="selectPixel"
      />

      <div class="flex flex-col gap-4">
        <section class="rounded-lg border border-stone-200 p-4 text-sm">
          <div class="flex items-center justify-between gap-3">
            <div>
              <p class="text-xs text-stone-500">演示地址</p>
              <p class="font-mono">{{ wallet.account.value ? short(wallet.account.value.address) : '生成中…' }}</p>
            </div>
            <button class="rounded border border-stone-300 px-3 py-1.5" type="button" @click="wallet.copyAddress()">
              {{ wallet.copied.value ? '已复制' : '复制' }}
            </button>
          </div>
          <p class="mt-3">余额：{{ grid.synced.value ? `${grid.formatEther(grid.balance.value)} MON` : '未同步' }}</p>
          <p>可领取：{{ grid.synced.value ? `${grid.formatEther(grid.pending.value)} MON` : '未同步' }}</p>
          <button
            class="mt-3 rounded bg-stone-900 px-3 py-1.5 text-white disabled:opacity-40"
            type="button"
            :disabled="grid.pending.value === 0n || paint.inflight.value"
            @click="paint.withdraw()"
          >
            提现
          </button>
        </section>

        <section class="rounded-lg border border-stone-200 p-4 text-sm">
          <p class="mb-2 text-xs text-stone-500">颜色</p>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="(swatch, index) in PALETTE"
              :key="swatch"
              class="h-7 w-7 rounded border-2"
              :class="paint.color.value === index ? 'border-stone-900' : 'border-transparent'"
              :style="{ background: swatch }"
              type="button"
              @click="paint.color.value = index"
            />
          </div>
          <p class="mt-3">像素 #{{ paint.pixelId.value }}</p>
          <div v-if="grid.awaitingSettle.value" class="mt-3 space-y-2 rounded border border-amber-300 bg-amber-50 p-3">
            <p class="font-semibold text-amber-900">等待链上结算</p>
            <p>预计获胜者：{{ lastPainterLabel }}</p>
            <p>预计奖励：{{ grid.formatEther(grid.winnerCredit.value) }} MON（80%）</p>
            <p>滚存：{{ grid.formatEther(grid.rollover.value) }} MON</p>
            <button class="rounded bg-amber-800 px-3 py-1.5 text-white disabled:opacity-40" type="button" :disabled="paint.inflight.value" @click="paint.settleRound()">
              {{ paint.inflight.value ? '等待回执…' : '结算本轮' }}
            </button>
          </div>
          <p v-if="grid.loading.value" class="text-stone-500">正在读取画布…</p>
          <p v-else-if="!grid.synced.value" class="text-red-700">画布尚未同步</p>
          <template v-else-if="paint.quote.value && paint.quote.value.pixelId === paint.pixelId.value">
            <p>下一口价：{{ paint.formatEther(paint.quote.value.nextPrice) }} MON</p>
            <p>前任预计回款：{{ paint.formatEther(paint.quote.value.previousCredit) }} MON</p>
            <p>奖池增量：{{ paint.formatEther(paint.quote.value.poolDelta) }} MON</p>
            <p v-if="paint.quote.value.owner === zeroAddress">首次购买，支付金额全部进入奖池</p>
            <p v-if="paint.heldByMe.value" class="font-semibold text-amber-800">你已持有</p>
            <div v-if="!grid.awaitingSettle.value" class="mt-3 flex gap-2">
              <button class="rounded border px-3 py-1.5 disabled:opacity-40" type="button" :disabled="paint.quoting.value || paint.heldByMe.value || paint.inflight.value" @click="paint.confirmQuote()">
                确认金额
              </button>
              <button class="rounded bg-orange-700 px-3 py-1.5 text-white disabled:opacity-40" type="button" :disabled="paint.quoting.value || paint.confirmedPrice.value === null || paint.confirmedPixelId.value !== paint.pixelId.value || paint.heldByMe.value || paint.inflight.value" @click="paint.sendPaint()">
                {{ paint.inflight.value ? '等待回执…' : '购买' }}
              </button>
            </div>
          </template>
          <p class="mt-2">{{ paint.message.value }}</p>
        </section>
      </div>
    </div>

    <section class="rounded-lg border border-stone-200 p-4 text-sm">
      <h2 class="font-semibold">最近成交</h2>
      <p v-if="grid.trades.value.length === 0" class="mt-2 text-stone-500">还没有链上成交</p>
      <ul v-else class="mt-2 space-y-2">
        <li v-for="trade in grid.trades.value" :key="trade.hash" class="flex items-center justify-between gap-3">
          <span>#{{ trade.pixelId }} · {{ short(trade.painter) }} · {{ grid.formatEther(trade.payment) }} MON</span>
          <a class="text-orange-700 underline" :href="grid.txUrl(trade.hash)" target="_blank" rel="noreferrer">浏览器</a>
        </li>
      </ul>
    </section>
  </main>
</template>
