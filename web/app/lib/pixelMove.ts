const SIZE = 64

export function movePixel(id: number, key: string) {
  if (key !== 'ArrowLeft' && key !== 'ArrowRight' && key !== 'ArrowUp' && key !== 'ArrowDown') {
    return null
  }
  const x = id % SIZE
  const y = Math.floor(id / SIZE)
  let nextX = x
  let nextY = y
  if (key === 'ArrowLeft') nextX = Math.max(0, x - 1)
  if (key === 'ArrowRight') nextX = Math.min(SIZE - 1, x + 1)
  if (key === 'ArrowUp') nextY = Math.max(0, y - 1)
  if (key === 'ArrowDown') nextY = Math.min(SIZE - 1, y + 1)
  return nextY * SIZE + nextX
}
