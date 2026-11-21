<script setup lang="ts">
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
        <h1 class="brand">领地争夺战</h1>
        <p class="tagline">像素领地上的最后一笔争夺</p>
      </div>
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
    </div>
  </header>
</template>

<style scoped>
.game-header { color: #29221e; }
.masthead { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 4px 0 20px; }
.brand { font-size: clamp(24px, 3vw, 32px); font-weight: 800; letter-spacing: -.035em; line-height: 1.2; }
.tagline { margin-top: 5px; font-size: 13px; color: #6b5c50; }
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
@media (max-width: 600px) {
  .masthead { padding-bottom: 8px; align-items: flex-start; }
  .brand { font-size: 22px; }
  .tagline { display: none; }
  .round-board { grid-template-columns: 1.2fr 1fr; gap: 8px; padding: 10px 12px; }
  .pool-value, .timer-value { margin-top: 2px; font-size: 22px; }
  .last-painter { display: flex; align-items: baseline; gap: 8px; grid-column: 1 / -1; border-top: 1px solid #eee8df; padding-top: 8px; }
  .address { margin: 0; font-size: 13px; }
  .chain-state { display: none; }
  .rules-line { display: none; }
  .rules-line p { display: none; }
}
</style>
