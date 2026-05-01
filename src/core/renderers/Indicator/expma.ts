import { EXPMA_COLORS } from '@/core/theme/colors'
import type { RendererPlugin, RenderContext } from '@/plugin'
import { RENDERER_PRIORITY } from '@/plugin'
import type { KLineData } from '@/types/price'
import { alignToPhysicalPixelCenter } from '@/core/draw/pixelAlign'

export interface EXPMAConfig {
  /** 快线周期（默认12） */
  fastPeriod?: number
  /** 慢线周期（默认50） */
  slowPeriod?: number
}

interface EXPMAPoint {
  fast: number
  slow: number
}

/**
 * 计算所有 EXPMA 值
 * 公式：EXPMA(i) = C(i) × K + EXPMA(i-1) × (1-K)，K = 2/(N+1)
 */
function calcEXPMAData(
  data: KLineData[],
  fastPeriod: number,
  slowPeriod: number
): EXPMAPoint[] {
  const result: EXPMAPoint[] = new Array(data.length)

  if (data.length === 0) return result

  const fastK = 2 / (fastPeriod + 1)
  const slowK = 2 / (slowPeriod + 1)

  // 第一个点的 EXPMA 等于第一天的收盘价
  const firstClose = data[0]!.close
  let fastEMA = firstClose
  let slowEMA = firstClose

  result[0] = { fast: fastEMA, slow: slowEMA }

  for (let i = 1; i < data.length; i++) {
    const close = data[i]!.close
    fastEMA = close * fastK + fastEMA * (1 - fastK)
    slowEMA = close * slowK + slowEMA * (1 - slowK)
    result[i] = { fast: fastEMA, slow: slowEMA }
  }

  return result
}

/**
 * 计算指定索引处的 EXPMA 值（供图例使用）
 */
export function calcEXPMAAtIndex(
  data: KLineData[],
  index: number,
  fastPeriod: number = 12,
  slowPeriod: number = 50
): { fast: number; slow: number } | null {
  if (index < 0 || index >= data.length) return null

  const fastK = 2 / (fastPeriod + 1)
  const slowK = 2 / (slowPeriod + 1)

  const firstClose = data[0]!.close
  let fastEMA = firstClose
  let slowEMA = firstClose

  for (let i = 1; i <= index; i++) {
    const close = data[i]!.close
    fastEMA = close * fastK + fastEMA * (1 - fastK)
    slowEMA = close * slowK + slowEMA * (1 - slowK)
  }

  return { fast: fastEMA, slow: slowEMA }
}

/**
 * 创建 EXPMA（指数平滑移动平均线）渲染器插件
 */
export function createEXPMARendererPlugin(initialConfig: EXPMAConfig = {}): RendererPlugin {
  const config: Required<EXPMAConfig> = {
    fastPeriod: 12,
    slowPeriod: 50,
    ...initialConfig,
  }

  // 缓存计算结果
  let cachedData: KLineData[] | null = null
  let cachedFastPeriod: number = 0
  let cachedSlowPeriod: number = 0
  let expmaPoints: EXPMAPoint[] = []

  function getEXPMAPoints(data: KLineData[]): EXPMAPoint[] {
    if (
      cachedData !== data ||
      cachedFastPeriod !== config.fastPeriod ||
      cachedSlowPeriod !== config.slowPeriod
    ) {
      expmaPoints = calcEXPMAData(data, config.fastPeriod, config.slowPeriod)
      cachedData = data
      cachedFastPeriod = config.fastPeriod
      cachedSlowPeriod = config.slowPeriod
    }
    return expmaPoints
  }

  return {
    name: 'expma',
    version: '1.0.0',
    description: 'EXPMA 指数平滑移动平均线渲染器',
    debugName: 'EXPMA',
    paneId: 'main',
    priority: RENDERER_PRIORITY.INDICATOR,

    draw(context: RenderContext) {
      const { ctx, pane, data, range, scrollLeft, kWidth, dpr, kLinePositions } = context
      const klineData = data as KLineData[]
      if (klineData.length < 2) return

      const expmaData = getEXPMAPoints(klineData)

      ctx.save()
      ctx.translate(-scrollLeft, 0)

      const drawStart = range.start
      const drawEnd = Math.min(range.end, klineData.length)

      // 快线颜色（橙色）
      const fastColor = EXPMA_COLORS.FAST
      // 慢线颜色（蓝色）
      const slowColor = EXPMA_COLORS.SLOW

      const drawLine = (type: 'fast' | 'slow', color: string) => {
        ctx.strokeStyle = color
        ctx.lineWidth = 1
        ctx.lineJoin = 'round'
        ctx.lineCap = 'round'
        ctx.beginPath()
        let isFirst = true

        for (let i = drawStart; i < drawEnd; i++) {
          const expma = expmaData[i]
          if (!expma) continue

          const logicX = kLinePositions[i - range.start]! + kWidth / 2
          const logicY = pane.yAxis.priceToY(expma[type])
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

      drawLine('fast', fastColor)
      drawLine('slow', slowColor)

      ctx.restore()
    },

    onDataUpdate() {
      cachedData = null
    },

    getConfig() {
      return { ...config }
    },

    setConfig(newConfig: Record<string, unknown>) {
      if ('fastPeriod' in newConfig && newConfig.fastPeriod !== config.fastPeriod) {
        cachedData = null
      }
      if ('slowPeriod' in newConfig && newConfig.slowPeriod !== config.slowPeriod) {
        cachedData = null
      }
      Object.assign(config, newConfig)
    },
  }
}
