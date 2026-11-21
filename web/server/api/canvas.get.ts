import { zeroAddress } from 'viem'
import { EMBERGRID_ADDRESS, createMonadPublicClient } from '@embergrid/shared'
import { embergridAbi } from '../../app/lib/embergridAbi'
import { createSnapshotCache, type CanvasSnapshot } from '../../app/lib/canvasSnapshot'

const PIXEL_COUNT = 4096
const PAGE = 256
const cache = createSnapshotCache<CanvasSnapshot>(8_000)

async function loadCanvas(): Promise<CanvasSnapshot> {
  const config = useRuntimeConfig()
  const client = createMonadPublicClient(config.public.monadRpcUrl)
  const blockNumber = await client.getBlockNumber({ cacheTime: 0 })
  const pages = await Promise.all(Array.from({ length: PIXEL_COUNT / PAGE }, (_, page) => {
    const start = page * PAGE
    return client.readContract({
      address: EMBERGRID_ADDRESS,
      abi: embergridAbi,
      functionName: 'getPixels',
      args: [BigInt(start), BigInt(PAGE)],
      blockNumber,
    }).then((result) => ({ start, result }))
  }))
  const colors = Array<number>(PIXEL_COUNT).fill(0)
  const owned = Array<number>(PIXEL_COUNT).fill(0)
  for (const { start, result } of pages) {
    const [owners, , pageColors] = result
    for (let index = 0; index < PAGE; index += 1) {
      colors[start + index] = pageColors[index] ?? 0
      owned[start + index] = owners[index] && owners[index] !== zeroAddress ? 1 : 0
    }
  }
  return {
    blockNumber: blockNumber.toString(),
    updatedAt: Date.now(),
    colors,
    owned,
  }
}

export default defineEventHandler(() => cache.get(loadCanvas))
