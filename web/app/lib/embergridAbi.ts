import { parseAbi } from 'viem'

export const embergridAbi = parseAbi([
  'function quotePaint(uint256 pixelId) view returns (address owner, uint256 nextPrice, uint256 previousOwnerCredit)',
  'function paint(uint256 pixelId, uint8 color) payable',
  'function pixels(uint256 pixelId) view returns (address owner, uint88 price, uint8 color)',
  'error IncorrectPayment()',
  'error CannotBuyOwnPixel()',
  'error RoundAwaitingSettle()',
  'error InvalidPixelId()',
  'error InvalidColor()',
])
