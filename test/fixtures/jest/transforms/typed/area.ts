interface Box {
  height: number
  width: number
}

function area(box: Box): number {
  return box.width * box.height
}

function fits(box: Box, limit: number): boolean {
  return area(box) <= limit
}

let unit: string = 'cm'

module.exports = { area, fits, unit }
