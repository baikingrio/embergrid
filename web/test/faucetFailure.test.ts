import assert from 'node:assert/strict'
import test from 'node:test'
import { describeFaucetFailure } from '../server/utils/faucetFailure.ts'

test('an unfunded signer is not confused with an empty faucet', () => {
  const error = { cause: { cause: { name: 'InsufficientFundsError', message: 'Insufficient funds for gas * price + value' } } }
  const result = describeFaucetFailure(error)
  assert.equal(result.statusCode, 503)
  assert.match(result.statusMessage, /Gas 余额不足/)
  assert.equal(describeFaucetFailure({ cause: { data: { errorName: 'Insufficient' } } }).statusMessage, '水龙头余额不足')
})

test('claim cooldown, wrong owner, and RPC throttling have actionable responses', () => {
  assert.equal(describeFaucetFailure({ cause: { data: { errorName: 'Cooldown' } } }).statusCode, 429)
  assert.match(describeFaucetFailure({ cause: { data: { errorName: 'NotOwner' } } }).statusMessage, /配置不正确/)
  assert.match(describeFaucetFailure({ message: 'RPC Request failed. Status: 429' }).statusMessage, /节点繁忙/)
})

test('unknown RPC errors do not expose internal request details', () => {
  assert.deepEqual(describeFaucetFailure({ message: 'private internal transport details' }), {
    statusCode: 500,
    statusMessage: '领取失败，请稍后重试',
  })
})
