export function describeFaucetFailure(error: unknown) {
  let current: unknown = error
  for (let depth = 0; current && depth < 8; depth += 1) {
    if (typeof current !== 'object') break
    const record = current as { name?: string, data?: { errorName?: string }, message?: string, cause?: unknown }
    const text = record.message?.toLowerCase() ?? ''
    if (record.name === 'InsufficientFundsError' || text.includes('insufficient funds')) {
      return { statusCode: 503, statusMessage: '水龙头服务的 Gas 余额不足，请联系维护者补充测试 MON' }
    }
    const name = record.data?.errorName
    if (name === 'Cooldown' || record.message?.includes('Cooldown')) {
      return { statusCode: 429, statusMessage: '24 小时内已经领过' }
    }
    if (name === 'Insufficient' || record.message?.includes('Insufficient()')) {
      return { statusCode: 503, statusMessage: '水龙头余额不足' }
    }
    if (name === 'NotOwner') {
      return { statusCode: 503, statusMessage: '水龙头签名账户配置不正确，请联系维护者' }
    }
    if (text.includes('429') || text.includes('rate limit')) {
      return { statusCode: 503, statusMessage: '测试网节点繁忙，请稍后重试' }
    }
    current = record.cause
  }
  return { statusCode: 500, statusMessage: '领取失败，请稍后重试' }
}
