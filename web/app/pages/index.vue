<script setup lang="ts">
import { COLOR_NAMES, PALETTE } from '~/lib/palette'
import { paintBudget } from '~/lib/paintBudget'
import { zeroAddress } from 'viem'
import { EMBERGRID_ADDRESS, MONAD_TESTNET_EXPLORER } from '@embergrid/shared'

const wallet = useDemoWallet()
const paint = usePaintSession()
const grid = useGridState()
const now = ref(Date.now())
const claiming = ref(false)
const walletExpanded = shallowRef(false)
const claimMessage = ref('')
const batchDetailsOpen = ref(false)
const pageShell = useTemplateRef<HTMLElement>('pageShell')
const canvasFitSize = shallowRef<number | null>(null)
let layoutObserver: ResizeObserver | undefined
let fitFrame = 0

function scheduleCanvasFit() {
  cancelAnimationFrame(fitFrame)
  fitFrame = requestAnimationFrame(() => {
    const canvas = pageShell.value?.querySelector('.canvas-viewport')
    const dock = pageShell.value?.querySelector('.action-dock')
    if (!canvas || !dock) return
    const top = canvas.getBoundingClientRect().top + window.scrollY
    const height = window.visualViewport?.height ?? window.innerHeight
    const available = Math.max(160, Math.floor(height - top - dock.getBoundingClientRect().height - 16))
    if (canvasFitSize.value !== available) canvasFitSize.value = available
  })
}

useHead({
  title: '领地争夺战 · Monad 像素领地争夺',
  meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' }],
})

const colorPicker = useTemplateRef<HTMLDetailsElement>('colorPicker')

function chooseColor(index: number) {
  paint.color.value = index
  if (colorPicker.value) {
    colorPicker.value.open = false
    colorPicker.value.querySelector('summary')?.focus()
  }
}

let clock = 0
onMounted(() => {
  clock = window.setInterval(() => {
    now.value = Date.now()
  }, 1000)
  void nextTick(() => {
    layoutObserver = new ResizeObserver(scheduleCanvasFit)
    if (pageShell.value) layoutObserver.observe(pageShell.value)
    const dock = pageShell.value?.querySelector('.action-dock')
    if (dock) layoutObserver.observe(dock)
    scheduleCanvasFit()
  })
  window.addEventListener('resize', scheduleCanvasFit)
  window.visualViewport?.addEventListener('resize', scheduleCanvasFit)
})
onUnmounted(() => {
  if (clock) window.clearInterval(clock)
  layoutObserver?.disconnect()
  cancelAnimationFrame(fitFrame)
  window.removeEventListener('resize', scheduleCanvasFit)
  window.visualViewport?.removeEventListener('resize', scheduleCanvasFit)
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

const funds = computed(() => {
  const batchCount = paint.batchIds.value.length
  const batchReady = batchCount > 0 && paint.batchQuotes.value.length === batchCount
  const single = paint.quote.value?.pixelId === paint.pixelId.value ? paint.quote.value : null
  if (!grid.synced.value) return null
  if (batchReady) {
    return {
      count: batchCount,
      payment: paint.batchTotal.value,
      ...paintBudget(batchCount, paint.batchTotal.value, grid.balance.value, grid.baseFee.value),
    }
  }
  if (batchCount === 0 && single) {
    return {
      count: 1,
      payment: single.nextPrice,
      ...paintBudget(1, single.nextPrice, grid.balance.value, grid.baseFee.value),
    }
  }
  return null
})

const fundsNote = computed(() => {
  const current = funds.value
  if (!current?.short) return ''
  const claim = '再领 0.2 MON'
  if (current.count >= 64) return `余额不够支付这 64 格和 Gas。缩小选区，或${claim}。一次领取通常不够买满 64 格。`
  if (current.count > 1) return `余额不够支付这 ${current.count} 格和 Gas。缩小选区，或${claim}。`
  return `余额不够支付这一格和 Gas。可以先${claim}。`
})

const dockSummary = computed(() => {
  if (grid.awaitingSettle.value) return ''
  if (paint.batchIds.value.length > 0) {
    if (paint.batchQuoting.value) return '正在读取批量报价…'
    if (funds.value && funds.value.count > 1) {
      return `合计支付 ${paint.formatEther(funds.value.payment)} MON · 余额 ${paint.formatEther(grid.balance.value)} · Gas 预算 ${paint.formatEther(funds.value.gas)}`
    }
    return '正在合计支付…'
  }
  if (grid.synced.value && paint.quote.value && paint.quote.value.pixelId === paint.pixelId.value) {
    const gas = funds.value ? paint.formatEther(funds.value.gas) : '…'
    return `合计支付 ${paint.formatEther(paint.quote.value.nextPrice)} MON · 余额 ${paint.formatEther(grid.balance.value)} · Gas 预算 ${gas}`
  }
  return '选择像素后确认金额'
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
  <main ref="pageShell" class="game-shell" :style="{ '--canvas-fit-size': canvasFitSize ? `${canvasFitSize}px` : undefined }">
    <GameStatus
      :pool="grid.formatEther(grid.prizePool.value)"
      :countdown="countdown"
      :last-painter="lastPainterLabel"
      :synced="grid.synced.value"
      :awaiting-settle="grid.awaitingSettle.value"
    />

    <section v-if="grid.loadError.value" class="connection-error" role="alert">
      <p>连接测试网失败。{{ grid.loadError.value }} 默认的 0 不是链上结果。</p>
      <button class="mt-3 rounded bg-red-800 px-3 py-1.5 text-white" type="button" @click="grid.retry()">
        重试
      </button>
    </section>


    <div class="play-layout">
      <div class="canvas-column">
        <div class="section-heading"><h2>争夺画布</h2><span>64 × 64 · 4,096 格</span></div>
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
          @clear-batch="paint.clearBatch"
          @stroke-end="paint.fetchBatchQuotes"
        />
        <p id="canvas-help" class="mt-2 text-xs text-stone-500">点选一格开始；切换涂画可拖动多选。方向键也可选格，Shift 单击增删批量。画布上方可清空批量。</p>
    <section v-if="wallet.ready.value && !wallet.acknowledged.value" class="wallet-notice">
      <p>本机测试钱包：清除浏览器数据后，将无法再访问该地址里的测试币。</p>
      <button class="mt-3 rounded bg-amber-800 px-3 py-1.5 text-white" type="button" @click="wallet.acknowledge()">
        我知道了
      </button>
    </section>
      </div>

      <div class="control-column">
        <section class="wallet-panel" :class="{ expanded: walletExpanded }" aria-label="我的测试钱包">
          <button class="wallet-toggle" type="button" :aria-expanded="walletExpanded" aria-controls="wallet-account-details" @click="walletExpanded = !walletExpanded">
            <span>钱包 · {{ grid.synced.value ? `${grid.formatEther(grid.balance.value)} MON` : '未同步' }}</span><span>{{ walletExpanded ? '收起' : '展开' }}</span>
          </button>
          <div id="wallet-account-details" class="wallet-heading flex items-center justify-between gap-3">
            <div>
              <p class="text-xs text-stone-500">我的测试钱包</p>
              <p class="wallet-address">{{ wallet.account.value ? short(wallet.account.value.address) : '生成中…' }}</p>
            </div>
            <button class="rounded border border-stone-300 px-3 py-1.5" type="button" @click="wallet.copyAddress()">
              {{ wallet.copied.value ? '已复制' : '复制' }}
            </button>
          </div>
          <div class="wallet-balances">          <p class="mt-3">余额：{{ grid.synced.value ? `${grid.formatEther(grid.balance.value)} MON` : '未同步' }}</p>
          <p>可领取：{{ grid.synced.value ? `${grid.formatEther(grid.pending.value)} MON` : '未同步' }}</p>
          </div>
          <div class="wallet-actions">          <button
            class="claim-button mt-3 rounded border border-stone-300 px-3 py-1.5 disabled:opacity-40"
            type="button"
            :disabled="!wallet.account.value || claiming"
            @click="claim()"
          >
            {{ claiming ? '领取中…' : '领取 0.2 MON' }}
          </button>          <button
            class="wallet-withdraw mt-3 rounded bg-stone-900 px-3 py-1.5 text-white disabled:opacity-40"
            type="button"
            :disabled="grid.pending.value === 0n || paint.inflight.value"
            @click="paint.withdraw()"
          >
            提现
          </button>
          </div>
          <p v-if="claimMessage" class="mt-2 text-stone-600">{{ claimMessage }}</p>
        </section>

        <section class="selection-panel" aria-label="选色与购买">
          <div class="section-heading"><h2>给领地上色</h2></div>
          <details ref="colorPicker" class="color-picker">
            <summary class="color-picker-trigger">
              <span class="current-color" :style="{ background: PALETTE[paint.color.value] }" aria-hidden="true" />
              <span class="brush-label">我的画笔<strong>{{ COLOR_NAMES[paint.color.value] }}</strong></span>
              <span class="change-color">换颜色</span>
            </summary>
            <div class="color-palette">
            <button
              v-for="(swatch, index) in PALETTE"
              :key="swatch"
              class="color-swatch"
              :class="{ selected: paint.color.value === index }"
              :style="{ background: swatch }"
              type="button"
              :aria-label="`颜色 ${COLOR_NAMES[index]}`"
              :aria-pressed="paint.color.value === index"
              :title="COLOR_NAMES[index]"
              @click="chooseColor(index)"
            />
            </div>
          </details>
          <details class="precision-tools">
            <summary>精确定位</summary>
            <label class="pixel-field" for="pixel-number">
            像素编号
            <input
              id="pixel-number"
              class="pixel-input"
              type="number"
              min="0"
              max="4095"
              :value="paint.pixelId.value"
              @change="onPixelInput"
            >
            </label>
          </details>
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
            <p class="next-price">下一口价 <strong>{{ paint.formatEther(paint.quote.value.nextPrice) }} <span>MON</span></strong></p>
            <p v-if="paint.quote.value.owner !== zeroAddress" class="price-rule">覆盖支付前价 125%，前任获得其买入价 115% 的回款。</p>
            <p>前任预计回款：{{ paint.formatEther(paint.quote.value.previousCredit) }} MON</p>
            <p>奖池增量：{{ paint.formatEther(paint.quote.value.poolDelta) }} MON</p>
            <p v-if="paint.quote.value.owner === zeroAddress">首次购买，支付金额全部进入奖池</p>
            <p v-if="paint.heldByMe.value" class="font-semibold text-amber-800">你已持有</p>
          </template>
          <div class="mt-4 rounded border border-stone-200 p-3">
            <p class="font-semibold">批量绘图 <span class="font-normal text-stone-500">最多 64 格，一次上链</span></p>
            <p class="mt-1 text-stone-600">按住拖动像画画一样连续选格。松开后确认合计金额，再一次上链。任一格价格变化或不合法时，整笔失败。</p>
            <div class="mt-2 flex flex-wrap gap-2">
              <button class="rounded border px-3 py-1.5 disabled:opacity-40" type="button" :disabled="paint.inflight.value" @click="paint.toggleBatch(paint.pixelId.value)">
                {{ paint.batchIds.value.includes(paint.pixelId.value) ? '移出当前像素' : '加入当前像素' }}
              </button>
              <button class="rounded border border-amber-800/30 bg-orange-50 px-3 py-1.5 text-amber-900 disabled:opacity-40" type="button" :disabled="paint.batchIds.value.length === 0 || paint.inflight.value" @click="paint.clearBatch()">
                清空批量
              </button>
            </div>
            <button class="mt-2 underline" type="button" :disabled="paint.batchQuotes.value.length === 0" @click="batchDetailsOpen = !batchDetailsOpen">
              {{ batchDetailsOpen ? '收起明细' : '展开明细' }}
            </button>
            <ul v-if="batchDetailsOpen" class="batch-details">
              <li v-for="item in paint.batchQuotes.value" :key="item.pixelId">
                #{{ item.pixelId }} 支付 {{ paint.formatEther(item.nextPrice) }} · 前任 {{ paint.formatEther(item.previousCredit) }} · 奖池 {{ paint.formatEther(item.poolDelta) }} MON
              </li>
            </ul>
          </div>
          <p class="transaction-status" role="status" aria-live="polite" aria-atomic="true">{{ paint.message.value }}</p>
          <a v-if="paint.txHash.value" class="transaction-link" :href="grid.txUrl(paint.txHash.value)" target="_blank" rel="noreferrer">查看本次链上交易 ↗</a>
        </section>
      </div>
    </div>

    <section class="trade-feed">
      <div class="section-heading"><h2>链上最近成交</h2><span>真实交易，可在 Monad 浏览器核验</span></div>
      <p v-if="grid.trades.value.length === 0" class="feed-empty">{{ grid.synced.value ? '当前读取范围内暂无成交。选一格，开启新的争夺。' : '等待链上记录同步…' }}</p>
      <ul v-else class="mt-2 space-y-2">
        <li v-for="trade in grid.trades.value" :key="`${trade.hash}:${trade.logIndex}`" class="flex items-center justify-between gap-3">
          <span>#{{ trade.pixelId }} · {{ short(trade.painter) }} · {{ grid.formatEther(trade.payment) }} MON</span>
          <a class="text-orange-700 underline" :href="grid.txUrl(trade.hash)" target="_blank" rel="noreferrer">浏览器</a>
        </li>
      </ul>
    </section>

    <footer class="game-footer">
      <NuxtLink to="/intro">项目介绍</NuxtLink>
      <a :href="`${MONAD_TESTNET_EXPLORER}/address/${EMBERGRID_ADDRESS}`" target="_blank" rel="noreferrer">Monad 测试网合约 ↗</a>
      <span>仅使用测试 MON</span>
    </footer>

    <div class="action-dock">
      <div class="action-dock-inner">
        <details class="dock-details">
          <summary>
            <strong>{{ grid.awaitingSettle.value ? '等待结算' : funds ? `${paint.formatEther(funds.payment)} MON` : '等待报价' }}</strong>
            <span>明细</span>
          </summary>
          <div class="dock-detail-content">
            <p>{{ grid.awaitingSettle.value ? '本轮已到期。结算后才能继续购买。' : (paint.message.value || '选择像素后确认金额') }}</p>
            <p v-if="paint.batchIds.value.length">已选 {{ paint.batchIds.value.length }} / 64 格</p>
            <p>{{ dockSummary }}</p>
            <p v-if="fundsNote">{{ fundsNote }}</p>
            <p v-if="paint.batchIncludesMine.value">批量里包含你已持有的像素</p>
          </div>
        </details>
        <div class="dock-actions flex gap-2">
          <template v-if="grid.awaitingSettle.value">
            <button class="rounded bg-amber-800 px-3 py-1.5 text-white disabled:opacity-40" type="button" :disabled="paint.inflight.value" @click="paint.settleRound()">
              {{ paint.inflight.value ? '等待回执…' : '结算本轮' }}
            </button>
          </template>
          <template v-else-if="paint.batchIds.value.length > 0">
            <button class="rounded border px-3 py-1.5 disabled:opacity-40" type="button" :disabled="!grid.synced.value || paint.batchQuoting.value || paint.batchIncludesMine.value || paint.batchQuotes.value.length !== paint.batchIds.value.length || paint.batchQuotes.value.length === 0 || paint.inflight.value || funds?.short" @click="paint.confirmBatch()">
              确认批量金额
            </button>
            <button class="rounded bg-orange-700 px-3 py-1.5 text-white disabled:opacity-40" type="button" :disabled="!paint.batchReady.value || paint.batchIncludesMine.value || paint.inflight.value || funds?.short" @click="paint.sendBatch()">
              {{ paint.inflight.value ? '等待回执…' : '批量购买' }}
            </button>
          </template>
          <template v-else>
            <button class="rounded border px-3 py-1.5 disabled:opacity-40" type="button" :disabled="!grid.synced.value || !paint.quote.value || paint.quote.value.pixelId !== paint.pixelId.value || paint.quoting.value || paint.heldByMe.value || paint.inflight.value || funds?.short" @click="paint.confirmQuote()">
              确认金额
            </button>
            <button class="rounded bg-orange-700 px-3 py-1.5 text-white disabled:opacity-40" type="button" :disabled="paint.quoting.value || paint.confirmedPrice.value === null || paint.confirmedPixelId.value !== paint.pixelId.value || paint.heldByMe.value || paint.inflight.value || funds?.short" @click="paint.sendPaint()">
              {{ paint.inflight.value ? '等待回执…' : '购买' }}
            </button>
          </template>
        </div>
        <p v-if="fundsNote || paint.batchIncludesMine.value" class="dock-alert" role="status">{{ fundsNote ? '余额不足，请领取测试 MON 或缩小选区。' : '选区包含本人持有的像素，请移除后重试。' }}</p>
        <p v-if="paint.inflight.value || paint.status.value === 'failed' || paint.status.value === 'confirmed'" class="dock-feedback" role="status" aria-live="polite">{{ paint.message.value }}</p>
      </div>
    </div>
  </main>
</template>

<style scoped>
.game-shell { max-width: 1120px; margin: 0 auto; min-height: 100dvh; padding: 24px 24px calc(120px + env(safe-area-inset-bottom)); color: #29221e; font-size: 14px; }
.action-dock { position: fixed; right: 0; bottom: 0; left: 0; z-index: 20; border-top: 1px solid #ded8d0; background: #fffdf9; padding: 8px 16px max(8px, env(safe-area-inset-bottom)); }
.action-dock-inner { max-width: 1120px; margin: 0 auto; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 4px 12px; font-size: 13px; }
.action-dock button { min-height: 44px; }
.dock-details > summary { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 10px; min-height: 44px; cursor: pointer; }
.dock-details > summary::-webkit-details-marker { display: none; }
.dock-details > summary strong { font-size: 17px; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.dock-details > summary > span { color: #6b5c50; text-decoration: underline; text-underline-offset: 3px; font-size: 12px; }
.dock-detail-content { position: absolute; bottom: calc(100% + 8px); left: max(12px, calc((100vw - 1120px) / 2)); width: min(480px, calc(100vw - 24px)); max-height: 45svh; overflow-y: auto; padding: 16px; border: 1px solid #ded8d0; border-radius: 12px; background: #fffdf9; color: #5f5147; overflow-wrap: anywhere; }
.dock-detail-content p + p { margin-top: 10px; }
.dock-actions { min-height: 44px; }
.dock-actions button { font-size: 13px; padding: 8px 12px; }
.dock-alert, .dock-feedback { grid-column: 1 / -1; margin: 0; font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; }
.dock-alert { color: #8a3d16; }
.game-footer { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 24px; margin-top: 24px; border-top: 1px solid #ded8d0; padding-top: 12px; color: #6b5c50; font-size: 12px; }
.game-footer a { display: inline-flex; align-items: center; min-height: 44px; color: #765338; text-decoration: underline; text-underline-offset: 3px; }
.batch-details { max-height: 12rem; margin-top: 8px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; }
.play-layout { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(340px, 1fr); align-items: start; gap: 24px; margin-top: 12px; }
.canvas-column, .control-column { min-width: 0; }
.control-column { display: flex; flex-direction: column; gap: 16px; }
.section-heading { display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
.section-heading h2 { font-size: 16px; font-weight: 700; }
.section-heading > span { color: #6b5c50; font-size: 12px; }
.wallet-panel { background: #efe9df; padding: 16px 18px; border-radius: 12px; }
.wallet-toggle { display: none; }
.price-rule { color: #6b5c50; margin-bottom: 8px; font-size: 12px; line-height: 1.6; }
.wallet-address { font-variant-numeric: tabular-nums; font-size: 13px; margin-top: 3px; }
.wallet-balances { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin: 12px 0; font-size: 13px; }
.wallet-balances p { margin: 0; }
.wallet-actions { display: flex; gap: 8px; }
.wallet-actions button { margin-top: 0; flex: 1; }
.wallet-panel button, .connection-error button { min-height: 44px; }
.wallet-notice { display: flex; justify-content: space-between; align-items: center; gap: 14px; padding: 10px 14px; background: #fcf0d7; border-radius: 10px; color: #68471c; font-size: 12px; margin-bottom: 14px; }
.wallet-notice button { flex-shrink: 0; min-height: 44px; margin: 0; }
.connection-error { padding: 16px; margin-bottom: 14px; background: #fff0eb; color: #913a22; border-radius: 10px; }
.selection-panel { padding: 20px; border: 1px solid #ded8d0; background: #fff; border-radius: 14px; font-size: 13px; }
.selection-panel button { min-height: 44px; }
.color-picker { margin-bottom: 10px; }
.color-picker-trigger { display: flex; align-items: center; gap: 12px; min-height: 64px; cursor: pointer; border-bottom: 1px solid #eee8df; padding: 0 0 14px; }
.color-picker-trigger::-webkit-details-marker { display: none; }
.current-color { width: 36px; height: 36px; flex-shrink: 0; border-radius: 8px; border: 1px solid #29221e30; }
.brush-label { display: grid; gap: 2px; color: #6b5c50; font-size: 12px; }
.brush-label strong { color: #29221e; font-size: 15px; font-weight: 600; }
.change-color { margin-left: auto; color: #93401e; text-decoration: underline; text-underline-offset: 4px; font-size: 13px; }
.color-picker[open] .color-palette { margin-top: 16px; }
.color-picker-trigger:focus-visible, .precision-tools > summary:focus-visible { outline: 2px solid #8d421d; outline-offset: 3px; }
.precision-tools { color: #6b5c50; font-size: 12px; margin-bottom: 14px; }
.precision-tools > summary { cursor: pointer; min-height: 44px; display: flex; align-items: center; text-decoration: underline; text-underline-offset: 4px; }
.precision-tools .pixel-field { margin-top: 8px; }
.color-palette { display: grid; grid-template-columns: repeat(auto-fit, minmax(44px, 1fr)); gap: 7px; margin-bottom: 18px; }
.color-swatch { min-width: 44px; height: 44px; border-radius: 7px; border: 3px solid #fff; box-shadow: inset 0 0 0 1px #29221e20; }
.color-swatch.selected { outline: 2px solid #29221e; outline-offset: 0; }
.color-swatch:focus-visible { outline: 3px solid #8d421d; outline-offset: 2px; }
.pixel-field { display: flex; justify-content: space-between; align-items: center; padding-bottom: 14px; margin-bottom: 16px; border-bottom: 1px solid #eee8df; }
.pixel-input { border: 1px solid #bdb3a5; border-radius: 6px; width: 100px; min-height: 44px; padding: 8px 12px; font-size: 16px; background: #fffdf9; }
.next-price { display: flex; justify-content: space-between; gap: 10px; align-items: baseline; margin-bottom: 12px; }
.next-price strong { font-size: 24px; font-variant-numeric: tabular-nums; color: #a63e1c; }
.next-price strong span { font-size: 12px; font-weight: 500; }
.transaction-status { margin-top: 14px; color: #6b5c50; overflow-wrap: anywhere; }
.transaction-link { display: inline-flex; align-items: center; min-height: 44px; color: #93401e; text-decoration: underline; text-underline-offset: 4px; }
.trade-feed { border-top: 1px solid #ded8d0; padding-top: 22px; margin-top: 28px; }
.feed-empty { color: #6b5c50; padding: 12px 0; }
.trade-feed li { padding: 10px 0; border-bottom: 1px solid #eee8df; flex-wrap: wrap; }
.game-shell button:focus-visible, .game-shell input:focus-visible, .game-shell a:focus-visible { outline: 2px solid #8d421d; outline-offset: 3px; }
@media (max-width: 760px) {
  .dock-actions button { font-size: 12px; padding: 8px 10px; }
  .action-dock { padding-left: 12px; padding-right: 12px; }
  .action-dock-inner { column-gap: 8px; }
  .dock-details > summary strong { font-size: 15px; }
  .game-shell { padding: max(14px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) calc(120px + env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left)); }
  .play-layout { display: flex; flex-direction: column; gap: 16px; margin-top: 8px; }
  .control-column { display: contents; }
  .canvas-column, .wallet-panel, .selection-panel { width: 100%; }
  .wallet-panel { order: -1; padding: 8px; display: grid; grid-template-columns: minmax(0, 1fr) auto; column-gap: 10px; }
  .wallet-toggle { display: flex; align-items: center; justify-content: space-between; gap: 8px; text-align: left; min-height: 44px; padding: 0 4px; font-size: 12px; }
  .wallet-toggle > span:last-child { color: #765338; font-size: 11px; }
  .wallet-panel:not(.expanded) .wallet-heading, .wallet-panel:not(.expanded) .wallet-balances, .wallet-panel:not(.expanded) .wallet-withdraw { display: none; }
  .wallet-panel:not(.expanded) .wallet-actions { display: contents; }
  .wallet-panel:not(.expanded) .claim-button { grid-column: 2; grid-row: 1; margin: 0; }
  .wallet-panel > p { grid-column: 1 / -1; }
  .wallet-panel.expanded { display: flex; flex-direction: column; }
  .wallet-panel.expanded .wallet-toggle { margin-bottom: 8px; border-bottom: 1px solid #d7cdbd; }
  .selection-panel { padding: 16px; }
  .wallet-notice { font-size: 11px; padding: 8px 10px; gap: 8px; }
  .wallet-balances { margin: 8px 0; }
  .section-heading { margin-bottom: 10px; }
  .trade-feed .section-heading > span { font-size: 11px; }
}
</style>
