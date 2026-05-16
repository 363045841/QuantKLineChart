import type { RendererPlugin, RenderContext } from '@/plugin'
import { RENDERER_PRIORITY } from '@/plugin'
import type { KLineData } from '@/types/price'
import { alignToPhysicalPixelCenter } from '@/core/draw/pixelAlign'

export interface ENEConfig {
  /** 周期（默认10） */
  period?: number
  /** 偏离率百分比（默认11） */
  deviation?: number
}

interface ENEPoint {
  upper: number
  middle: number
  lower: number
}

/**
 * 计算所有 ENE 值
 * 中轨 = MA(close, N)
 * 上轨 = 中轨 × (1 + M/100)
 * 下轨 = 中轨 × (1 - M/100)
 */
function calcENEData(
  data: KLineData[],
  period: number,
  deviation: number
): ENEPoint[] {
  const result: ENEPoint[] = new Array(data.length)

  if (data.length < period) return result

  // 使用滑动窗口计算 MA
  let sum = 0

  // 初始化第一个窗口
  for (let i = 0; i < period; i++) {
    const item = data[i]
    if (!item) return result
    sum += item.close
  }

  // 第一个有效点
  const firstMA = sum / period
  const firstDeviation = deviation / 100
  result[period - 1] = {
    upper: firstMA * (1 + firstDeviation),
    middle: firstMA,
    lower: firstMA * (1 - firstDeviation),
  }

  // 滑动计算后续点
  for (let i = period; i < data.length; i++) {
    const prevItem = data[i - period]
    const currItem = data[i]
    if (!prevItem || !currItem) continue

    sum = sum - prevItem.close + currItem.close
    const ma = sum / period
    const dev = deviation / 100

    result[i] = {
      upper: ma * (1 + dev),
      middle: ma,
      lower: ma * (1 - dev),
    }
  }

  return result
}

/**
 * 计算指定索引处的 ENE 值（供图例使用）
 */
export function calcENEAtIndex(
  data: KLineData[],
  index: number,
  period: number = 10,
  deviation: number = 11
): { upper: number; middle: number; lower: number } | null {
  if (index < period - 1 || index >= data.length) return null

  // 计算 MA
  let sum = 0
  for (let i = 0; i < period; i++) {
    const item = data[index - i]
    if (!item) return null
    sum += item.close
  }
  const ma = sum / period
  const dev = deviation / 100

  return {
    upper: ma * (1 + dev),
    middle: ma,
    lower: ma * (1 - dev),
  }
}

/**
 * 创建 ENE（轨道线）渲染器插件
 */
export function createENERendererPlugin(initialConfig: ENEConfig = {}): RendererPlugin {
  const config: Required<ENEConfig> = {
    period: 10,
    deviation: 11,
    ...initialConfig,
  }

  // 缓存计算结果
  let cachedData: KLineData[] | null = null
  let cachedPeriod: number = 0
  let cachedDeviation: number = 0
  let enePoints: ENEPoint[] = []

  function getENEPoints(data: KLineData[]): ENEPoint[] {
    if (
      cachedData !== data ||
      cachedPeriod !== config.period ||
      cachedDeviation !== config.deviation
    ) {
      enePoints = calcENEData(data, config.period, config.deviation)
      cachedData = data
      cachedPeriod = config.period
      cachedDeviation = config.deviation
    }
    return enePoints
  }

  return {
    name: 'ene',
    version: '1.0.0',
    description: 'ENE 轨道线渲染器',
    debugName: 'ENE轨道线',
    paneId: 'main',
    priority: RENDERER_PRIORITY.INDICATOR,

    draw(context: RenderContext) {
      const { ctx, pane, data, range, scrollLeft, dpr, kLineCenters } = context
      const klineData = data as KLineData[]
      if (klineData.length < config.period) return

      const eneData = getENEPoints(klineData)

      ctx.save()
      ctx.translate(-scrollLeft, 0)

      const drawStart = Math.max(range.start, config.period - 1)
      const drawEnd = Math.min(range.end, klineData.length)

      // 上轨颜色（红色）
      const upperColor = 'rgba(214, 10, 34, 1)'
      // 中轨颜色（蓝色）
      const middleColor = 'rgba(69, 112, 249, 1)'
      // 下轨颜色（绿色）
      const lowerColor = 'rgba(3, 123, 102, 1)'
      // 带状区域填充
      const bandFill = 'rgba(69, 112, 249, 0.08)'

      // 先绘制带状区域
      ctx.fillStyle = bandFill
      ctx.beginPath()
      let isFirst = true

      // 上轨
      for (let i = drawStart; i < drawEnd; i++) {
        const ene = eneData[i]
        if (!ene) continue

        const centerX = kLineCenters[i - range.start]
        if (centerX === undefined) continue
        const logicY = pane.yAxis.priceToY(ene.upper)
        const x = centerX
        const y = alignToPhysicalPixelCenter(logicY, dpr)

        if (isFirst) {
          ctx.moveTo(x, y)
          isFirst = false
        } else {
          ctx.lineTo(x, y)
        }
      }

      // 下轨（反向）
      for (let i = drawEnd - 1; i >= drawStart; i--) {
        const ene = eneData[i]
        if (!ene) continue

        const centerX = kLineCenters[i - range.start]
        if (centerX === undefined) continue
        const logicY = pane.yAxis.priceToY(ene.lower)
        const x = centerX
        const y = alignToPhysicalPixelCenter(logicY, dpr)

        ctx.lineTo(x, y)
      }

      ctx.closePath()
      ctx.fill()

      // 绘制线条
      ctx.lineWidth = 1
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'

      const drawLine = (type: 'upper' | 'middle' | 'lower', color: string) => {
        ctx.strokeStyle = color
        ctx.beginPath()
        let isFirst = true

        for (let i = drawStart; i < drawEnd; i++) {
          const ene = eneData[i]
          if (!ene) continue

          const centerX = kLineCenters[i - range.start]
          if (centerX === undefined) continue
          const logicY = pane.yAxis.priceToY(ene[type])
          const x = centerX
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

      drawLine('upper', upperColor)
      drawLine('middle', middleColor)
      drawLine('lower', lowerColor)

      ctx.restore()
    },

    onDataUpdate() {
      cachedData = null
    },

    getConfig() {
      return { ...config }
    },

    setConfig(newConfig: Record<string, unknown>) {
      if ('period' in newConfig && newConfig.period !== config.period) {
        cachedData = null
      }
      if ('deviation' in newConfig && newConfig.deviation !== config.deviation) {
        cachedData = null
      }
      Object.assign(config, newConfig)
    },
  }
}
