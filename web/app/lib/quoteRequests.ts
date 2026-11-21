export type QuoteTicket = {
  pixelId: number
  token: number
  isCurrent: (selectedPixelId: number) => boolean
}

export function createQuoteRequests() {
  let generation = 0
  return {
    start(pixelId: number): QuoteTicket {
      generation += 1
      const token = generation
      const requestedPixelId = pixelId
      return {
        pixelId: requestedPixelId,
        token,
        isCurrent(selectedPixelId: number) {
          return token === generation && requestedPixelId === selectedPixelId
        },
      }
    },
  }
}
