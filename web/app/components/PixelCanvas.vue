<script setup lang="ts">
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
}>()

const canvas = ref<HTMLCanvasElement | null>(null)
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

function pixelFromEvent(event: MouseEvent) {
  const el = canvas.value
  if (!el) return null
  const rect = el.getBoundingClientRect()
  const x = Math.floor(((event.clientX - rect.left) / rect.width) * SIZE)
  const y = Math.floor(((event.clientY - rect.top) / rect.height) * SIZE)
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return null
  return y * SIZE + x
}

function onClick(event: MouseEvent) {
  const id = pixelFromEvent(event)
  if (id === null) return
  if (event.shiftKey) emit('toggleBatch', id)
  emit('select', id)
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
onMounted(draw)
</script>

<template>
  <canvas
    ref="canvas"
    class="h-auto w-full max-w-[512px] cursor-crosshair rounded border border-stone-700 bg-stone-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500"
    :width="SIZE * SCALE"
    :height="SIZE * SCALE"
    tabindex="0"
    role="application"
    :aria-label="`余烬格画布，64 乘 64。当前像素 ${selected ?? 0}。方向键移动选择，按住 Shift 点击加入批量。`"
    aria-describedby="canvas-help"
    @click="onClick"
    @keydown="onKeydown"
  />
</template>
