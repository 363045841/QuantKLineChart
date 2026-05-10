/**
 * 缩放计算纯函数
 * 无副作用、无 DOM 访问，供 Vue 层直接调用
 */

export interface ZoomConfig {
  minKWidth: number
  maxKWidth: number
  zoomLevelCount: number
  dpr: number
}

export interface ZoomResult {
  targetLevel: number
  newKWidth: number
  newKGap: number
  newScrollLeft: number
}

const PHYS_K_GAP = 3

/** 将缩放级别转换为 K 线宽度（逻辑像素） */
export function zoomLevelToKWidth(level: number, config: ZoomConfig): number {
  const t = (level - 1) / (config.zoomLevelCount - 1)
  return config.minKWidth + t * (config.maxKWidth - config.minKWidth)
}

/** 由 DPR 推导 K 线间隙（逻辑像素） */
export function kGapFromDpr(dpr: number): number {
  return PHYS_K_GAP / dpr
}

/**
 * 缩放一级（+1 放大 / -1 缩小）
 * 返回新状态或 null（已达边界）
 */
export function computeZoom(
  delta: number,
  mouseX: number,
  scrollLeft: number,
  currentLevel: number,
  currentKWidth: number,
  currentKGap: number,
  config: ZoomConfig,
): ZoomResult | null {
  const targetLevel = Math.max(1, Math.min(config.zoomLevelCount, currentLevel + delta))
  if (targetLevel === currentLevel) return null

  const newKWidth = zoomLevelToKWidth(targetLevel, config)
  const newKGap = kGapFromDpr(config.dpr)

  // 以鼠标位置为锚点的滚动校正
  const oldUnit = currentKWidth + currentKGap
  const centerIndex = (scrollLeft + mouseX) / oldUnit
  const newUnit = newKWidth + newKGap
  const newScrollLeft = centerIndex * newUnit - mouseX

  return { targetLevel, newKWidth, newKGap, newScrollLeft }
}

/**
 * 缩放到指定级别
 * 返回新状态或 null（级别不变或无效）
 */
export function computeZoomToLevel(
  targetLevel: number,
  anchorX: number,
  scrollLeft: number,
  currentLevel: number,
  currentKWidth: number,
  currentKGap: number,
  config: ZoomConfig,
): ZoomResult | null {
  const clamped = Math.max(1, Math.min(config.zoomLevelCount, Math.round(targetLevel)))
  const delta = clamped - currentLevel
  if (delta === 0) return null
  return computeZoom(delta, anchorX, scrollLeft, currentLevel, currentKWidth, currentKGap, config)
}
