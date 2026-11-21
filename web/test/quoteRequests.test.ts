import assert from 'node:assert/strict'
import test from 'node:test'
import { createQuoteRequests } from '../app/lib/quoteRequests.ts'

test('a slower quote for the previous pixel does not stay current', () => {
  const quotes = createQuoteRequests()
  const first = quotes.start(1)
  const second = quotes.start(2)

  assert.equal(first.isCurrent(2), false)
  assert.equal(second.isCurrent(2), true)
  assert.equal(second.isCurrent(1), false)
})

test('confirm is refused until the in-flight quote matches the selection', () => {
  const quotes = createQuoteRequests()
  const pending = quotes.start(1)
  let confirmed: number | null = null

  function confirm(selected: number, quotePixel: number | null) {
    if (quotePixel === null || !pending.isCurrent(selected) || quotePixel !== selected) return
    confirmed = quotePixel
  }

  confirm(2, null)
  assert.equal(confirmed, null)

  const current = quotes.start(2)
  function confirmCurrent(selected: number, quotePixel: number | null) {
    if (quotePixel === null || !current.isCurrent(selected) || quotePixel !== selected) return
    confirmed = quotePixel
  }
  confirmCurrent(2, 2)
  assert.equal(confirmed, 2)
})
