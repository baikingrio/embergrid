<script setup lang="ts">
import { EMPTY_PIXEL, PALETTE } from '~/lib/palette'

const props = defineProps<{
  colors: Uint8Array
  owned: Uint8Array
  revision: number
  selected: number | null
  pendingId: number | null
  pendingColor: number | null
}>()

const emit = defineEmits<{ select: [id: number] }>()

const canvas = ref<HTMLCanvasElement | null>(null)
const SIZE = 64
const SCALE = 8

function draw() {
  const el = canvas.value
  if (!el) return
  const ctx = el.getContext('2d')
  if (!ctx) return
  for (let id = 0; id < SIZE * SIZE; id++) {
    const x = id % SIZE
    const y = Math.floor(id / SIZE)
    const pending = props.pendingId === id && props.pendingColor !== null
    const colorIndex = pending ? props.pendingColor! : props.colors[id] ?? 0
    ctx.fillStyle = pending || props.owned[id] ? PALETTE[colorIndex] ?? EMPTY_PIXEL : EMPTY_PIXEL
    ctx.fillRect(x * SCALE, y * SCALE, SCALE, SCALE)
  }
  if (props.selected !== null) {
    const x = props.selected % SIZE
    const y = Math.floor(props.selected / SIZE)
    ctx.strokeStyle = '#fbbf24'
    ctx.lineWidth = 2
    ctx.strokeRect(x * SCALE + 1, y * SCALE + 1, SCALE - 2, SCALE - 2)
  }
}

function onClick(event: MouseEvent) {
  const el = canvas.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const x = Math.floor(((event.clientX - rect.left) / rect.width) * SIZE)
  const y = Math.floor(((event.clientY - rect.top) / rect.height) * SIZE)
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return
  emit('select', y * SIZE + x)
}

watch(() => [props.revision, props.selected, props.pendingId, props.pendingColor], draw)
onMounted(draw)
</script>

<template>
  <canvas
    ref="canvas"
    class="h-auto w-full max-w-[512px] cursor-crosshair rounded border border-stone-700 bg-stone-950"
    :width="SIZE * SCALE"
    :height="SIZE * SCALE"
    @click="onClick"
  />
</template>
