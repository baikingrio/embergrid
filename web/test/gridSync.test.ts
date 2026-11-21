import assert from 'node:assert/strict'
import test from 'node:test'
import { createGridSyncController, describeSyncError } from '../app/lib/gridSync.ts'

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

test('429 and exhausted fallbacks surface an error and still install watchers', async () => {
  assert.match(describeSyncError(new Error('HTTP request failed. Status: 429')), /公共节点繁忙/)
  assert.equal(describeSyncError(new Error('All fallback endpoints failed')), '无法连接测试网')

  let installed = 0
  let calls = 0
  const timers: Array<{ fn: () => void; cancelled: boolean }> = []
  const session = createGridSyncController({
    async sync() {
      calls += 1
      if (calls === 1) throw new Error('HTTP request failed. Status: 429')
    },
    installWatchers() {
      installed += 1
    },
    schedule(fn) {
      const timer = { fn, cancelled: false }
      timers.push(timer)
      return { cancel() { timer.cancelled = true } }
    },
  })

  session.start()
  await flush()

  assert.equal(installed, 1)
  assert.equal(session.snapshot().loading, false)
  assert.equal(session.snapshot().synced, false)
  assert.match(session.snapshot().error ?? '', /公共节点繁忙/)
  assert.equal(timers.length, 1)

  timers[0]?.fn()
  await flush()

  assert.equal(calls, 2)
  assert.equal(session.snapshot().synced, true)
  assert.equal(session.snapshot().error, null)
  assert.equal(installed, 1)
})

test('a late failure does not erase a newer successful retry', async () => {
  let releaseFirst: () => void = () => {}
  const first = new Promise<void>((resolve) => {
    releaseFirst = resolve
  })
  let calls = 0
  let scheduled = 0
  const session = createGridSyncController({
    async sync() {
      calls += 1
      if (calls === 1) {
        await first
        throw new Error('HTTP request failed. Status: 429')
      }
    },
    installWatchers() {},
    schedule() {
      scheduled += 1
      return { cancel() {} }
    },
  })

  session.start()
  session.retry()
  await flush()
  assert.equal(session.snapshot().synced, true)
  assert.equal(session.snapshot().error, null)

  releaseFirst()
  await flush()
  assert.equal(session.snapshot().synced, true)
  assert.equal(session.snapshot().error, null)
  assert.equal(scheduled, 0)
})

test('manual retry runs again after every endpoint failed', async () => {
  let calls = 0
  const session = createGridSyncController({
    async sync() {
      calls += 1
      if (calls === 1) throw new Error('All fallback endpoints failed')
    },
    installWatchers() {},
    schedule() {
      return { cancel() {} }
    },
  })

  session.start()
  await flush()
  assert.equal(session.snapshot().error, '无法连接测试网')

  session.retry()
  await flush()
  assert.equal(session.snapshot().synced, true)
  assert.equal(session.snapshot().error, null)
})
