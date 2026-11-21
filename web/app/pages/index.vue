<script setup lang="ts">
import { COLOR_NAMES, PALETTE } from '~/lib/palette'
import { zeroAddress } from 'viem'

const wallet = useDemoWallet()
const paint = usePaintSession()
const grid = useGridState()
const now = ref(Date.now())
const claiming = ref(false)
const claimMessage = ref('')

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

function selectPixel(id: number) {
  if (paint.inflight.value) return
  paint.pixelId.value = id
  void paint.fetchQuote()
}

function onPixelInput(event: Event) {
  const value = Number((event.target as HTMLInputElement).value)
  selectPixel(value)
}

watch(() => paint.status.value, (status) => {
  if (status === 'confirmed' || status === 'failed') void grid.sync()
})

watch(() => grid.synced.value, (synced) => {
  if (synced) void paint.fetchQuote()
})

function short(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

async function claim() {
  const address = wallet.account.value?.address
  if (!address || claiming.value) return
  claiming.value = true
  claimMessage.value = '正在领取测试 MON'
  try {
    await $fetch('/api/claim', { method: 'POST', body: { address } })
    claimMessage.value = '已领取 0.2 MON'
    await grid.syncAccount()
  } catch (error) {
    const data = error as { data?: { statusMessage?: string }, statusMessage?: string }
    claimMessage.value = data.data?.statusMessage || data.statusMessage || '领取失败'
  } finally {
    claiming.value = false
  }
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
      <div>
        <PixelCanvas
          :colors="grid.colors.value"
          :owned="grid.owned.value"
          :revision="grid.revision.value"
          :selected="paint.pixelId.value"
          :batch-ids="paint.batchIds.value"
          :pending-paints="paint.pendingPaints.value"
          @select="selectPixel"
          @toggle-batch="paint.toggleBatch"
          @add-batch="paint.addBatchIds"
          @stroke-end="paint.fetchBatchQuotes"
        />
        <p id="canvas-help" class="mt-2 text-xs text-stone-500">方向键选择像素，Tab 到颜色和确认金额。按住拖动连续加入批量，Shift 单击增删单格，最多 64 格。</p>
      </div>

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
          <button
            class="mt-3 rounded border border-stone-300 px-3 py-1.5 disabled:opacity-40"
            type="button"
            :disabled="!wallet.account.value || claiming"
            @click="claim()"
          >
            {{ claiming ? '领取中…' : '领取 0.2 MON' }}
          </button>
          <p v-if="claimMessage" class="mt-2 text-stone-600">{{ claimMessage }}</p>
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
              class="h-7 w-7 rounded border-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900"
              :class="paint.color.value === index ? 'border-stone-900' : 'border-transparent'"
              :style="{ background: swatch }"
              type="button"
              :aria-label="`颜色 ${COLOR_NAMES[index]}`"
              :aria-pressed="paint.color.value === index"
              :title="COLOR_NAMES[index]"
              @click="paint.color.value = index"
            />
          </div>
          <label class="mt-3 block" for="pixel-number">
            像素编号
            <input
              id="pixel-number"
              class="ml-2 w-24 rounded border border-stone-300 px-2 py-1"
              type="number"
              min="0"
              max="4095"
              :value="paint.pixelId.value"
              @change="onPixelInput"
            >
          </label>
          <div v-if="paint.settleResult.value" class="mt-3 space-y-2 rounded border border-emerald-300 bg-emerald-50 p-3">
            <p class="font-semibold text-emerald-950">本轮已结算</p>
            <p>获胜者：{{ short(paint.settleResult.value.winner) }}</p>
            <p>已记入可领取余额：{{ paint.formatEther(paint.settleResult.value.credit) }} MON（80%）</p>
            <p>滚存：{{ paint.formatEther(paint.settleResult.value.rollover) }} MON（20%）</p>
            <p>可以开启下一轮。</p>
          </div>
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
          <div class="mt-4 rounded border border-stone-200 p-3">
            <p class="font-semibold">批量绘图 <span class="font-normal text-stone-500">最多 64 格，一次上链</span></p>
            <p class="mt-1 text-stone-600">按住拖动像画画一样连续选格。松开后确认合计金额，再一次上链。任一格价格变化或不合法时，整笔失败。</p>
            <div class="mt-2 flex flex-wrap gap-2">
              <button class="rounded border px-3 py-1.5 disabled:opacity-40" type="button" :disabled="paint.inflight.value" @click="paint.toggleBatch(paint.pixelId.value)">
                {{ paint.batchIds.value.includes(paint.pixelId.value) ? '移出当前像素' : '加入当前像素' }}
              </button>
              <button class="rounded border px-3 py-1.5 disabled:opacity-40" type="button" :disabled="paint.batchIds.value.length === 0 || paint.inflight.value" @click="paint.clearBatch()">
                清空
              </button>
            </div>
            <p class="mt-2">已选 {{ paint.batchIds.value.length }} / 64</p>
            <p v-if="paint.batchQuoting.value" class="text-stone-500">正在读取批量报价…</p>
            <ul v-else class="mt-2 space-y-1">
              <li v-for="item in paint.batchQuotes.value" :key="item.pixelId">
                #{{ item.pixelId }} 支付 {{ paint.formatEther(item.nextPrice) }} · 前任 {{ paint.formatEther(item.previousCredit) }} · 奖池 {{ paint.formatEther(item.poolDelta) }} MON
              </li>
            </ul>
            <p v-if="paint.batchQuotes.value.length > 0" class="mt-2 font-semibold">合计支付 {{ paint.formatEther(paint.batchTotal.value) }} MON</p>
            <p v-if="paint.batchIncludesMine.value" class="font-semibold text-amber-800">批量里包含你已持有的像素</p>
            <div v-if="grid.synced.value && !grid.awaitingSettle.value" class="mt-3 flex gap-2">
              <button class="rounded border px-3 py-1.5 disabled:opacity-40" type="button" :disabled="paint.batchQuoting.value || paint.batchIncludesMine.value || paint.batchQuotes.value.length === 0 || paint.inflight.value" @click="paint.confirmBatch()">
                确认批量金额
              </button>
              <button class="rounded bg-orange-700 px-3 py-1.5 text-white disabled:opacity-40" type="button" :disabled="!paint.batchReady.value || paint.batchIncludesMine.value || paint.inflight.value" @click="paint.sendBatch()">
                {{ paint.inflight.value ? '等待回执…' : '批量购买' }}
              </button>
            </div>
          </div>
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
