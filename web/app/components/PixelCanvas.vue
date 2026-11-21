<script setup lang="ts">
import { pixelsOnLine } from '~/lib/batchSelection'
import { EMPTY_PIXEL, PALETTE } from '~/lib/palette'
import { movePixel } from '~/lib/pixelMove'

const props = defineProps<{
  colors: Uint8Array
  owned: Uint8Array
  revision: number
  selected: number | null
  batchIds: number[]
  pendingPaints: { id: number, color: number }[]
}>()

const emit = defineEmits<{
  select: [id: number]
  toggleBatch: [id: number]
  addBatch: [ids: number[]]
  clearBatch: []
  strokeEnd: []
}>()

const canvas = useTemplateRef<HTMLCanvasElement>('canvas')
const viewport = useTemplateRef<HTMLDivElement>('viewport')
const coarse = shallowRef(import.meta.client && window.matchMedia('(pointer: coarse)').matches)
const mode = shallowRef<'select' | 'draw'>(coarse.value ? 'select' : 'draw')
const zoom = shallowRef(1)
const isEmpty = computed(() => !props.owned.some(Boolean))
const modeHelp = computed(() => {
  if (!coarse.value) {
    return mode.value === 'draw'
      ? '涂画模式：拖动选格，松开后报价。切回点选可滚动浏览。'
      : '点选模式：轻点选格，滑动浏览。放大后更容易精确选择。'
  }
  if (mode.value === 'draw' && zoom.value > 1) return '涂画：一根手指加格，松开后报价。两根手指拖动画面。工具栏可清空批量。'
  if (mode.value === 'draw') return '涂画：一根手指把经过的格子放进批量，松开后报价。工具栏可清空批量。'
  return '点选：轻点选格，一根手指滑动画面。'
})
let stroke: { pointerId: number, lastId: number, moved: boolean, startX: number, startY: number } | null = null
const pointers = new Map<number, { x: number, y: number }>()
let pan: { x: number, y: number, scrollLeft: number, scrollTop: number } | null = null
let panLocked = false
const SIZE = 64
const SCALE = 8

function draw() {
  const el = canvas.value
  if (!el) return
  const ctx = el.getContext('2d')
  if (!ctx) return
  const pending = new Map(props.pendingPaints.map((paint) => [paint.id, paint.color]))
  for (let id = 0; id < SIZE * SIZE; id++) {
    const x = id % SIZE
    const y = Math.floor(id / SIZE)
    const pendingColor = pending.get(id)
    const colorIndex = pendingColor ?? props.colors[id] ?? 0
    ctx.fillStyle = pendingColor === undefined && !props.owned[id] ? EMPTY_PIXEL : PALETTE[colorIndex] ?? EMPTY_PIXEL
    ctx.fillRect(x * SCALE, y * SCALE, SCALE, SCALE)
  }
  ctx.strokeStyle = '#38bdf8'
  ctx.lineWidth = 2
  for (const id of props.batchIds) {
    const x = id % SIZE
    const y = Math.floor(id / SIZE)
    ctx.strokeRect(x * SCALE + 1, y * SCALE + 1, SCALE - 2, SCALE - 2)
  }
  if (props.selected !== null) {
    const x = props.selected % SIZE
    const y = Math.floor(props.selected / SIZE)
    ctx.strokeStyle = '#fbbf24'
    ctx.lineWidth = 2
    ctx.strokeRect(x * SCALE + 1, y * SCALE + 1, SCALE - 2, SCALE - 2)
  }
}

function pixelFromEvent(event: PointerEvent) {
  const el = canvas.value
  if (!el) return null
  const rect = el.getBoundingClientRect()
  const x = Math.floor(((event.clientX - rect.left) / rect.width) * SIZE)
  const y = Math.floor(((event.clientY - rect.top) / rect.height) * SIZE)
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return null
  return y * SIZE + x
}

function capture(pointerId: number) {
  const el = canvas.value
  if (!el) return
  try {
    el.setPointerCapture(pointerId)
  } catch {}
}

function centroid() {
  let x = 0
  let y = 0
  for (const point of pointers.values()) {
    x += point.x
    y += point.y
  }
  return { x: x / pointers.size, y: y / pointers.size }
}

function beginPan() {
  const el = viewport.value
  if (!el || pointers.size < 2) return
  const point = centroid()
  pan = { x: point.x, y: point.y, scrollLeft: el.scrollLeft, scrollTop: el.scrollTop }
}

function releaseStroke() {
  if (!stroke) return
  const moved = stroke.moved
  const id = stroke.lastId
  const pointerId = stroke.pointerId
  stroke = null
  if (canvas.value?.hasPointerCapture(pointerId)) canvas.value.releasePointerCapture(pointerId)
  if (!moved) {
    emit('select', id)
    return
  }
  emit('strokeEnd')
}

function onPointerDown(event: PointerEvent) {
  if (event.button !== 0) return
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
  const phoneDraw = coarse.value && mode.value === 'draw'
  if (phoneDraw && (panLocked || pointers.size > 1)) {
    if (stroke) releaseStroke()
    panLocked = true
    if (zoom.value > 1) beginPan()
    capture(event.pointerId)
    return
  }
  const id = pixelFromEvent(event)
  if (id === null) {
    pointers.delete(event.pointerId)
    return
  }
  if (mode.value === 'draw') capture(event.pointerId)
  stroke = { pointerId: event.pointerId, lastId: id, moved: false, startX: event.clientX, startY: event.clientY }
}

function onPointerMove(event: PointerEvent) {
  const point = pointers.get(event.pointerId)
  if (point) {
    point.x = event.clientX
    point.y = event.clientY
  }
  if (pan && pointers.size >= 2) {
    const el = viewport.value
    if (!el) return
    const next = centroid()
    el.scrollLeft = pan.scrollLeft - (next.x - pan.x)
    el.scrollTop = pan.scrollTop - (next.y - pan.y)
    if (event.cancelable) event.preventDefault()
    return
  }
  if (!stroke || event.pointerId !== stroke.pointerId || panLocked) return
  if (mode.value === 'select') {
    if (Math.hypot(event.clientX - stroke.startX, event.clientY - stroke.startY) > 8) stroke.moved = true
    return
  }
  const id = pixelFromEvent(event)
  if (id === null || id === stroke.lastId) return
  stroke.moved = true
  const line = pixelsOnLine(stroke.lastId, id)
  stroke.lastId = id
  emit('addBatch', line)
}

function onPointerUp(event: PointerEvent) {
  pointers.delete(event.pointerId)
  if (panLocked) {
    if (stroke?.pointerId === event.pointerId) releaseStroke()
    pan = null
    if (pointers.size >= 2 && zoom.value > 1) beginPan()
    if (pointers.size === 0) panLocked = false
    return
  }
  if (!stroke || event.pointerId !== stroke.pointerId) return
  const id = pixelFromEvent(event) ?? stroke.lastId
  const moved = stroke.moved
  stroke = null
  if (!moved) {
    if (event.shiftKey) emit('toggleBatch', id)
    emit('select', id)
    return
  }
  if (mode.value === 'draw') emit('strokeEnd')
}

function onPointerCancel(event: PointerEvent) {
  pointers.delete(event.pointerId)
  if (stroke?.pointerId === event.pointerId) stroke = null
  pan = null
  if (pointers.size === 0) panLocked = false
}

function onKeydown(event: KeyboardEvent) {
  const next = movePixel(props.selected ?? 0, event.key)
  if (next === null) return
  event.preventDefault()
  if (next !== props.selected) emit('select', next)
}

watch(
  () => [
    props.revision,
    props.selected,
    props.batchIds.join(','),
    props.pendingPaints.map((paint) => `${paint.id}:${paint.color}`).join(','),
  ],
  draw,
)
onMounted(() => {
  coarse.value = window.matchMedia('(pointer: coarse)').matches
  if (coarse.value) mode.value = 'select'
  draw()
})

async function changeZoom(next: number) {
  zoom.value = Math.max(1, Math.min(8, next))
  await nextTick()
  const el = viewport.value
  if (zoom.value === 1) {
    if (el) {
      el.scrollLeft = 0
      el.scrollTop = 0
    }
    return
  }
  revealSelection()
}

function revealSelection() {
  const el = viewport.value
  if (!el || zoom.value === 1) return
  const id = props.selected ?? 0
  const size = el.clientWidth * zoom.value / SIZE
  el.scrollLeft = (id % SIZE + .5) * size - el.clientWidth / 2
  el.scrollTop = (Math.floor(id / SIZE) + .5) * size - el.clientHeight / 2
}

watch(() => props.selected, () => {
  if (coarse.value) return
  revealSelection()
})
</script>

<template>
  <div class="canvas-workspace">
    <div class="canvas-toolbar">
      <div class="mode-switch" aria-label="画布操作模式">
        <button type="button" :aria-pressed="mode === 'select'" @click="mode = 'select'">点选</button>
        <button type="button" :aria-pressed="mode === 'draw'" @click="mode = 'draw'">涂画</button>
      </div>
      <div class="clear-slot">
        <button
          type="button"
          class="clear-batch"
          :class="{ idle: batchIds.length === 0 }"
          :disabled="batchIds.length === 0"
          :tabindex="batchIds.length === 0 ? -1 : 0"
          :aria-hidden="batchIds.length === 0"
          @click="emit('clearBatch')"
        >
          清空<span class="clear-count">{{ batchIds.length || 0 }}</span>
        </button>
      </div>
      <div class="zoom-controls" aria-label="画布缩放">
        <button type="button" aria-label="缩小画布" :disabled="zoom === 1" @click="changeZoom(zoom / 2)">−</button>
        <button type="button" aria-label="重置画布缩放" @click="changeZoom(1)">{{ zoom }}×</button>
        <button type="button" aria-label="放大画布" :disabled="zoom === 8" @click="changeZoom(zoom * 2)">+</button>
      </div>
    </div>
    <div ref="viewport" class="canvas-viewport" :style="{ overscrollBehavior: zoom > 1 ? 'contain' : 'auto' }">
      <canvas
        ref="canvas"
        class="pixel-canvas"
        :style="{ width: `${zoom * 100}%`, touchAction: mode === 'draw' ? 'none' : 'auto' }"
        :width="SIZE * SCALE"
        :height="SIZE * SCALE"
        tabindex="0"
        role="application"
        :aria-label="`领地争夺战画布，64 乘 64。当前像素 ${selected ?? 0}。方向键移动选择；涂画模式下拖动加入批量。`"
        aria-describedby="canvas-mode-help"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerCancel"
        @keydown="onKeydown"
      />
      <div v-if="isEmpty && zoom === 1" class="empty-canvas" aria-hidden="true">
        <span>第一格，等你落色。</span>
        <span>点选任意位置，查看价格</span>
      </div>
    </div>
    <div class="canvas-caption">
      <span>选中 ({{ (selected ?? 0) % SIZE }}, {{ Math.floor((selected ?? 0) / SIZE) }})</span>
      <span>{{ batchIds.length ? `批量已选 ${batchIds.length} 格` : '每一格都是链上领地' }}</span>
    </div>
    <p id="canvas-mode-help" class="mode-help">{{ modeHelp }}</p>
  </div>
</template>

<style scoped>
.canvas-toolbar {
  display: grid;
  grid-template-columns: auto minmax(5.5rem, max-content) auto;
  align-items: center;
  justify-content: space-between;
  column-gap: 8px;
  margin-bottom: 10px;
}
.mode-switch, .zoom-controls { display: flex; gap: 2px; flex-shrink: 0; }
.mode-switch { padding: 3px; border: 1px solid #ded8d0; border-radius: 9px; background: #fff; }
.canvas-toolbar button { min-height: 44px; min-width: 44px; border-radius: 6px; color: #5f5147; font-size: 13px; }
.mode-switch button { padding: 0 18px; }
.mode-switch button[aria-pressed='true'] { background: #29221e; color: #fff; }
.zoom-controls button { border: 1px solid #ded8d0; background: #fff; }
.zoom-controls button:disabled { opacity: .4; }
.canvas-toolbar button:focus-visible, .clear-batch:focus-visible { outline: 2px solid #a63e1c; outline-offset: 3px; }
.clear-slot { display: flex; justify-content: center; min-height: 44px; }
.clear-batch {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 44px;
  min-width: 5.5rem;
  padding: 0 10px;
  border: 1px solid #c4a48a;
  border-radius: 6px;
  background: #fff7ef;
  color: #8a3d16;
  font-size: 13px;
  font-weight: 650;
}
.clear-batch.idle { visibility: hidden; pointer-events: none; }
.clear-count { min-width: 2ch; font-variant-numeric: tabular-nums; text-align: right; }
.canvas-viewport { position: relative; width: min(100%, var(--canvas-fit-size, 100%)); margin-inline: auto; aspect-ratio: 1; overflow: auto; border-radius: 12px; background: #0c0a09; border: 1px solid #3c322a; }
.pixel-canvas { display: block; max-width: none; height: auto; image-rendering: pixelated; cursor: crosshair; }
.pixel-canvas:focus-visible { outline: 2px solid #fbbf24; outline-offset: -3px; }
.empty-canvas { position: absolute; top: 44%; left: 0; right: 0; display: grid; gap: 9px; text-align: center; color: #e6d5bb; pointer-events: none; }
.empty-canvas span:first-child { font-size: clamp(18px, 2.2vw, 25px); letter-spacing: -.02em; }
.empty-canvas span:last-child { font-size: 12px; color: #a99986; }
.canvas-caption { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px; padding: 12px 0 6px; color: #5f5147; font-size: 12px; font-variant-numeric: tabular-nums; }
.mode-help { color: #6b5c50; font-size: 12px; line-height: 1.6; }
</style>
