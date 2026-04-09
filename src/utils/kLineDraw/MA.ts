import type { KLineData } from '@/types/price'
import { priceToY } from '../priceToY'
import type { drawOption, PriceRange } from './kLine'
import { alignToPhysicalPixelCenter } from '@/core/draw/pixelAlign'
import { MA_COLORS } from '@/core/theme/colors'

export const MA5_COLOR = MA_COLORS.MA5
export const MA10_COLOR = MA_COLORS.MA10
export const MA20_COLOR = MA_COLORS.MA20
export const MA30_COLOR = MA_COLORS.MA30
export const MA60_COLOR = MA_COLORS.MA60

/**
 * 通用 MA 线绘制函数 - 逻辑像素坐标系
 */
function drawMALine(
  ctx: CanvasRenderingContext2D,
  data: KLineData[],
  option: drawOption,
  logicHeight: number,
  dpr: number,
  startIndex: number,
  endIndex: number,
  priceRange: PriceRange | undefined,
  period: number,
  color: string,
  kLinePositions?: number[]
) {
  if (data.length < period) return

  const height = logicHeight

  const wantPad = option.yPaddingPx ?? 0
  const pad = Math.max(0, Math.min(wantPad, Math.floor(height / 2) - 1))
  const paddingTop = pad
  const paddingBottom = pad

  // 计算价格范围
  let maxPrice: number
  let minPrice: number

  if (priceRange) {
    maxPrice = priceRange.maxPrice
    minPrice = priceRange.minPrice
  } else {
    maxPrice = -Infinity
    minPrice = Infinity
    for (let i = startIndex; i < endIndex && i < data.length; i++) {
      const e = data[i]
      if (!e) continue
      if (e.high > maxPrice) maxPrice = e.high
      if (e.low < minPrice) minPrice = e.low
    }
  }

  if (!Number.isFinite(maxPrice) || !Number.isFinite(minPrice)) return

  ctx.strokeStyle = color
  ctx.lineWidth = 1
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.beginPath()

  let isFirst = true
  const drawStart = Math.max(startIndex, period - 1)

  for (let i = drawStart; i < endIndex && i < data.length; i++) {
    // 计算 MA 值
    let sum = 0
    for (let j = 0; j < period; j++) {
      const prev = data[i - j]
      if (!prev) return
      sum += prev.close
    }
    const maValue = sum / period

    // 使用统一坐标源计算 X 坐标
    let logicX: number
    if (kLinePositions && kLinePositions[i - startIndex] !== undefined) {
      // 使用预计算的坐标 + kWidth/2 得到中心点
      logicX = kLinePositions[i - startIndex]! + option.kWidth / 2
    } else {
      // 回退到原始计算
      const unit = option.kWidth + option.kGap
      logicX = option.kGap + i * unit + option.kWidth / 2
    }
    const logicY = priceToY(maValue, maxPrice, minPrice, height, paddingTop, paddingBottom)

    const x = alignToPhysicalPixelCenter(logicX, dpr)
    const y = alignToPhysicalPixelCenter(logicY, dpr)

    if (isFirst) {
      ctx.moveTo(x, y)
      isFirst = false
    } else {
      ctx.lineTo(x, y)
    }
  }

  ctx.stroke()
}

export function drawMA5Line(
  ctx: CanvasRenderingContext2D,
  data: KLineData[],
  option: drawOption,
  logicHeight: number,
  dpr: number = 1,
  startIndex: number = 0,
  endIndex: number = data.length,
  priceRange?: PriceRange,
  kLinePositions?: number[]
) {
  drawMALine(ctx, data, option, logicHeight, dpr, startIndex, endIndex, priceRange, 5, MA5_COLOR, kLinePositions)
}

export function drawMA10Line(
  ctx: CanvasRenderingContext2D,
  data: KLineData[],
  option: drawOption,
  logicHeight: number,
  dpr: number = 1,
  startIndex: number = 0,
  endIndex: number = data.length,
  priceRange?: PriceRange,
  kLinePositions?: number[]
) {
  drawMALine(ctx, data, option, logicHeight, dpr, startIndex, endIndex, priceRange, 10, MA10_COLOR, kLinePositions)
}

export function drawMA20Line(
  ctx: CanvasRenderingContext2D,
  data: KLineData[],
  option: drawOption,
  logicHeight: number,
  dpr: number = 1,
  startIndex: number = 0,
  endIndex: number = data.length,
  priceRange?: PriceRange,
  kLinePositions?: number[]
) {
  drawMALine(ctx, data, option, logicHeight, dpr, startIndex, endIndex, priceRange, 20, MA20_COLOR, kLinePositions)
}

export function drawMA30Line(
  ctx: CanvasRenderingContext2D,
  data: KLineData[],
  option: drawOption,
  logicHeight: number,
  dpr: number = 1,
  startIndex: number = 0,
  endIndex: number = data.length,
  priceRange?: PriceRange,
  kLinePositions?: number[]
) {
  drawMALine(ctx, data, option, logicHeight, dpr, startIndex, endIndex, priceRange, 30, MA30_COLOR, kLinePositions)
}

export function drawMA60Line(
  ctx: CanvasRenderingContext2D,
  data: KLineData[],
  option: drawOption,
  logicHeight: number,
  dpr: number = 1,
  startIndex: number = 0,
  endIndex: number = data.length,
  priceRange?: PriceRange,
  kLinePositions?: number[]
) {
  drawMALine(ctx, data, option, logicHeight, dpr, startIndex, endIndex, priceRange, 60, MA60_COLOR, kLinePositions)
}
