import { EMBERGRID_ADDRESS, createMonadPublicClient } from '@embergrid/shared'
import { embergridAbi } from '../../app/lib/embergridAbi'
import { createSnapshotCache } from '../../app/lib/canvasSnapshot'
import type { CanvasUpdates } from '../../app/lib/canvasUpdates'

// Share one small log read across viewers on the same server instance.
const cache = createSnapshotCache<CanvasUpdates>(750)

export default defineEventHandler(() => cache.get(async () => {
  const config = useRuntimeConfig()
  const client = createMonadPublicClient(config.public.monadRpcUrl)
  const head = await client.getBlockNumber({ cacheTime: 0 })
  const from = head > BigInt(31) ? head - BigInt(31) : BigInt(0)
  const logs = await client.getContractEvents({
    address: EMBERGRID_ADDRESS,
    abi: embergridAbi,
    eventName: 'Painted',
    fromBlock: from,
    toBlock: head,
  })
  return {
    fromBlock: from.toString(),
    toBlock: head.toString(),
    paints: logs.filter((log) => !log.removed && log.blockNumber !== null).map((log) => ({
      pixelId: Number(log.args.pixelId ?? BigInt(0)),
      color: Number(log.args.color ?? 0),
      blockNumber: log.blockNumber!.toString(),
      logIndex: log.logIndex!,
      hash: log.transactionHash!,
      painter: log.args.newOwner!,
      payment: (log.args.payment ?? BigInt(0)).toString(),
    })),
  }
}))
