<script setup lang="ts">
import { EMBERGRID_ADDRESS, MONAD_TESTNET_EXPLORER } from '@embergrid/shared'

defineProps<{
  pool: string
  countdown: string
  lastPainter: string
  synced: boolean
  awaitingSettle: boolean
}>()
</script>

<template>
  <header class="game-header">
    <div class="masthead">
      <div>
        <h1 class="brand">EmberGrid <span>余烬格</span></h1>
        <p class="tagline">像素领地上的最后一笔争夺</p>
      </div>
      <a class="network-link" :href="`${MONAD_TESTNET_EXPLORER}/address/${EMBERGRID_ADDRESS}`" target="_blank" rel="noreferrer">Monad 测试网 <span aria-hidden="true">↗</span></a>
    </div>
    <div class="round-board" aria-label="本轮链上状态">
      <div class="pool">
        <span class="stat-label">本轮奖池</span>
        <p class="pool-value">{{ synced ? pool : '未同步' }} <span v-if="synced">MON</span></p>
      </div>
      <div class="timer">
        <span class="stat-label">{{ awaitingSettle ? '争夺已结束' : '距离本轮结束' }}</span>
        <p class="timer-value" :class="{ 'timer-due': awaitingSettle }">{{ countdown }}</p>
      </div>
      <div class="last-painter">
        <span class="stat-label">最后争夺者</span>
        <p class="address">{{ lastPainter }}</p>
        <span class="chain-state">{{ synced ? '已读取链上状态' : '正在连接测试网' }}</span>
      </div>
    </div>
    <div class="rules-line">
      <p><strong>最后一笔，赢得 80% 奖池。</strong><span> 被覆盖时回款 115% · 争夺续时 180 秒。</span></p>
      <details class="rules-details">
        <summary>怎么玩？</summary>
        <div class="rules-content">
          <h2>每一格，都可以被重新争夺</h2>
          <ol>
            <li><strong>选格上色</strong>首次占领支付 0.01 MON；覆盖他人格支付前价的 125%。</li>
            <li><strong>前任回款</strong>像素被覆盖后，前任获得其买入价 115% 的可领取余额，差额进入奖池。</li>
            <li><strong>最后争夺者获奖</strong>180 秒无人再争夺，即可结算：80% 归最后玩家，20% 滚存。</li>
          </ol>
          <p>所有权、回款和奖池规则由 Monad 上的合约执行。点击右上角查看合约，成交记录可查看真实交易。</p>
          <p>仅使用测试 MON。回款以有人覆盖为条件；页面倒计时供参考，结果以链上执行顺序和时间为准。</p>
        </div>
      </details>
    </div>
  </header>
</template>

<style scoped>
.game-header { color: #29221e; }
.masthead { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 4px 0 20px; }
.brand { font-size: clamp(24px, 3vw, 32px); font-weight: 800; letter-spacing: -.035em; line-height: 1.2; }
.brand span { font-size: 15px; font-weight: 500; letter-spacing: 0; margin-left: 5px; color: #6b5c50; }
.tagline { margin-top: 5px; font-size: 13px; color: #6b5c50; }
.network-link { display: inline-flex; align-items: center; gap: 12px; flex-shrink: 0; min-height: 44px; padding: 0 12px; border: 1px solid #dcd2ef; border-radius: 8px; background: #f4f0fa; color: #594085; font-size: 12px; font-weight: 600; }
.network-link:hover { background: #eae2f5; }
.network-link:focus-visible, .rules-details summary:focus-visible { outline: 2px solid #7e4d25; outline-offset: 3px; }
.round-board { display: grid; grid-template-columns: 1.15fr 1fr 1fr; background: #fff; border: 1px solid #ded8d0; border-radius: 14px; padding: 22px 24px; gap: 20px; }
.stat-label { color: #6b5c50; font-size: 12px; }
.pool-value, .timer-value { margin-top: 7px; font-size: clamp(24px, 3.2vw, 40px); line-height: 1.1; font-weight: 750; font-variant-numeric: tabular-nums; letter-spacing: -.03em; overflow-wrap: anywhere; }
.pool-value { color: #a63e1c; }
.pool-value span { font-size: 13px; letter-spacing: 0; font-weight: 500; }
.timer-due { color: #a63e1c; }
.address { margin-top: 11px; font-size: 18px; font-variant-numeric: tabular-nums; }
.chain-state { display: block; font-size: 12px; color: #6b5c50; margin-top: 5px; }
.rules-line { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; font-size: 13px; padding: 13px 0; }
.rules-line p { line-height: 1.7; }
.rules-line p > span { color: #6b5c50; }
.rules-details { position: relative; flex-shrink: 0; }
.rules-details summary { min-height: 44px; display: flex; align-items: center; cursor: pointer; color: #93401e; text-decoration: underline; text-underline-offset: 4px; }
.rules-content { position: absolute; right: 0; top: 46px; width: min(440px, calc(100vw - 32px)); padding: 22px; background: #fffaf1; border: 1px solid #decbb1; border-radius: 12px; z-index: 5; box-shadow: 0 12px 30px #31221018; }
.rules-content h2 { font-size: 17px; font-weight: 700; margin-bottom: 16px; }
.rules-content ol { list-style: decimal; padding-left: 18px; }
.rules-content li { margin-bottom: 12px; line-height: 1.7; }
.rules-content li strong { display: block; }
.rules-content p { margin-top: 14px; font-size: 12px; color: #6b5c50; }
@media (max-width: 600px) {
  .masthead { padding-bottom: 8px; align-items: flex-start; }
  .brand { font-size: 22px; }
  .brand span { display: block; margin: 2px 0 0; font-size: 12px; }
  .tagline { display: none; }
  .network-link { font-size: 11px; gap: 6px; padding: 0 9px; }
  .round-board { grid-template-columns: 1.2fr 1fr; gap: 8px; padding: 10px 12px; }
  .pool-value, .timer-value { margin-top: 2px; font-size: 22px; }
  .last-painter { display: flex; align-items: baseline; gap: 8px; grid-column: 1 / -1; border-top: 1px solid #eee8df; padding-top: 8px; }
  .address { margin: 0; font-size: 13px; }
  .chain-state { display: none; }
  .rules-line { justify-content: flex-end; padding: 2px 0 0; }
  .rules-line p { display: none; }
}
</style>
