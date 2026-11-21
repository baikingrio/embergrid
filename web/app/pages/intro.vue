<script setup lang="ts">
useHead({
  title: '介绍 · 领地争夺战',
})

const projectUrl = 'https://embergrid-zeta.vercel.app'

const leads = [
  {
    title: '核心',
    body: '这不是一块大家一起涂的画布。每一格都有价格和持有者。你付溢价拿走它，前任得到可领取余额，差额进入奖池。最后一笔成功购买，决定谁拿走这一轮的 80%。',
  },
  {
    title: '怎么上手',
    body: '打开就有本地钱包。点领取拿 0.2 测试 MON。选格后看报价，确认金额再购买。发送后颜色先出现，以链上回执为准。',
  },
  {
    title: '为什么是 Monad',
    body: '价格、回款、奖池和最后争夺者记在同一份合约里。现场会连续覆盖，交易要便宜，确认要跟得上。Monad 兼容以太坊，出块 0.4 秒，最终确认 0.8 秒。画面上的颜色先出现，谁是最后争夺者以链上回执为准。',
  },
]

const beats = [
  {
    title: '这是什么',
    body: '领地争夺战。64×64 的像素领地，跑在 Monad 测试网。每一格都有持有者和价格。',
  },
  {
    title: '钱怎么走',
    body: '第一次买一格是 0.01 MON，全部进入奖池。覆盖别人的格子，支付前价的 125%。前任得到买入价 115% 的可领取余额，差额进入奖池。',
  },
  {
    title: '一轮怎么结束',
    body: '每笔成功购买把结束时间续到 180 秒之后。到期后结算，最后争夺者领取奖池的 80%，20% 滚存到下一轮。',
  },
  {
    title: '边界',
    body: '只用测试 MON。没人覆盖，就没有回款。谁是最后争夺者，以链上那一笔为准。',
  },
]
</script>

<template>
  <main class="intro">
    <header class="intro-header">
      <div>
        <h1>领地争夺战</h1>
        <p class="tagline">像素领地上的最后一笔争夺</p>
      </div>
      <aside class="project-access" aria-label="扫码访问项目">
        <a class="qr-entry" :href="projectUrl">
          <img src="/project-qr.svg" alt="领地争夺战公开演示二维码" width="180" height="180">
          <span>扫码进入画布</span>
        </a>
        <a class="project-url" :href="projectUrl">{{ projectUrl }}</a>
      </aside>
    </header>
    <section class="lead" aria-label="核心、上手与 Monad">
      <article v-for="lead in leads" :key="lead.title">
        <h2>{{ lead.title }}</h2>
        <p>{{ lead.body }}</p>
      </article>
    </section>
    <section class="beats" aria-label="项目介绍">
      <article v-for="beat in beats" :key="beat.title">
        <h2>{{ beat.title }}</h2>
        <p>{{ beat.body }}</p>
      </article>
    </section>
    <NuxtLink class="enter" to="/">进入画布</NuxtLink>
  </main>
</template>

<style scoped>
.intro {
  max-width: 1080px;
  margin: 0 auto;
  min-height: 100dvh;
  padding: 20px 28px 16px;
  color: #29221e;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.intro-header { display: flex; justify-content: space-between; align-items: center; gap: 24px; }
.project-access { flex-shrink: 0; text-align: center; }
.qr-entry { display: inline-flex; flex-direction: column; align-items: center; gap: 4px; color: #29221e; font-size: 14px; font-weight: 600; }
.qr-entry img { display: block; background: #fff; }
.project-url { display: block; min-height: 44px; align-content: center; font-size: 12px; color: #765338; text-decoration: underline; text-underline-offset: 3px; overflow-wrap: anywhere; }
.qr-entry:focus-visible, .project-url:focus-visible { outline: 2px solid #a63e1c; outline-offset: 3px; }
.intro-header h1 { font-size: 34px; font-weight: 800; letter-spacing: -.035em; line-height: 1.15; }
.tagline { margin-top: 4px; color: #6b5c50; font-size: 16px; }
.lead, .beats { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.lead article, .beats article { padding: 14px 16px; background: #fff; border: 1px solid #ded8d0; border-radius: 14px; }
.lead h2 { margin-bottom: 6px; font-size: 24px; font-weight: 750; letter-spacing: -.02em; }
.beats h2 { margin-bottom: 6px; font-size: 20px; font-weight: 750; letter-spacing: -.02em; }
.lead p { font-size: 16px; line-height: 1.4; }
.beats p { font-size: 15px; line-height: 1.4; }
.enter {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 160px;
  min-height: 52px;
  padding: 0 28px;
  border-radius: 8px;
  background: #29221e;
  color: #fff;
  font-size: 18px;
  font-weight: 650;
}
.enter:focus-visible { outline: 2px solid #a63e1c; outline-offset: 3px; }
@media (max-width: 800px) {
  .intro { min-height: auto; padding: max(20px, env(safe-area-inset-top)) 16px 32px; }
  .intro-header { flex-direction: column; align-items: flex-start; gap: 16px; }
  .project-access { align-self: center; }
  .intro-header h1 { font-size: 32px; }
  .lead, .beats { grid-template-columns: 1fr; }
  .lead h2, .beats h2 { font-size: 22px; }
  .lead p, .beats p { font-size: 17px; }
}
</style>
