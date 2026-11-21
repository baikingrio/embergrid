import { parseAbi } from 'viem'

export const embergridAbi = parseAbi([
  'function quotePaint(uint256 pixelId) view returns (address owner, uint256 nextPrice, uint256 previousOwnerCredit)',
  'function paint(uint256 pixelId, uint8 color) payable',
  'function pixels(uint256 pixelId) view returns (address owner, uint88 price, uint8 color)',
  'function getPixels(uint256 start, uint256 count) view returns (address[] owners, uint88[] prices, uint8[] colors)',
  'function prizePool() view returns (uint256)',
  'function lastPainter() view returns (address)',
  'function endTime() view returns (uint256)',
  'function pendingWithdrawals(address account) view returns (uint256)',
  'function withdraw()',
  'event Painted(uint256 indexed roundId, uint256 indexed pixelId, address indexed previousOwner, address newOwner, uint8 color, uint256 payment, uint256 previousOwnerCredit, uint256 prizePoolDelta)',
  'error IncorrectPayment()',
  'error CannotBuyOwnPixel()',
  'error RoundAwaitingSettle()',
  'error InvalidPixelId()',
  'error InvalidColor()',
  'error NothingToWithdraw()',
])
