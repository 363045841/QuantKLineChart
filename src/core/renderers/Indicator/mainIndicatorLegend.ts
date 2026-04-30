import type { RendererPlugin, RenderContext } from '@/plugin'
import { RENDERER_PRIORITY } from '@/plugin'
import type { KLineData } from '@/types/price'
import { calcMAAtIndex } from '@/utils/kline/ma'
import { calcBOLLAtIndex } from './boll'
import { MA_COLORS, BOLL_COLORS, PRICE_COLORS } from '@/core/theme/colors'

/** 指标行数据 */
interface IndicatorRow {
  enabled: boolean
  params: Record<string, unknown>
}

/** 渲染器配置 */
interface MainIndicatorLegendConfig {
  yPaddingPx: number
  indicators: Record<string, IndicatorRow>
}

/**
 * 创建主图指标图例渲染器插件
 *
 * 统一管理 MA、BOLL 等主图指标的图例显示，支持多行排列
 * 通过 setConfig 更新指标状态，不依赖事件系统
 */
export function createMainIndicatorLegendRendererPlugin(options: {
  yPaddingPx: number
}): RendererPlugin {
  const config: MainIndicatorLegendConfig = {
    yPaddingPx: options.yPaddingPx,
    indicators: {
      MA: { enabled: true, params: {} },
      BOLL: { enabled: false, params: { period: 20, multiplier: 2 } },
    },
  }

  return {
    name: 'mainIndicatorLegend',
    version: '1.0.0',
    description: '主图指标图例渲染器（统一管理 MA、BOLL 等）',
    debugName: '主图指标图例',
    paneId: 'main',
    priority: RENDERER_PRIORITY.FOREGROUND,
    enabled: true,

    draw(context: RenderContext) {
      const { ctx, data, range } = context
      const klineData = data as KLineData[]
      if (!klineData.length) return

      const fontSize = 12
      const lineHeight = fontSize + 6
      const legendX = 12
      const gap = 10

      ctx.save()
      ctx.font = `${fontSize}px Arial`
      ctx.textAlign = 'left'

      const lastIndex = Math.min(range.end - 1, klineData.length - 1)

      // 收集需要绘制的行
      const rows: Array<{ draw: (rowIndex: number) => void }> = []

      // MA 行
      const maIndicator = config.indicators.MA
      if (maIndicator?.enabled) {
        rows.push({
          draw: (rowIndex: number) => {
            const items: Array<{ label: string; color: string; value?: number }> = []
            const periods = maIndicator.params.periods as number[] | undefined
            if (periods && Array.isArray(periods)) {
              periods.forEach((p) => {
                const colorKey = `MA${p}` as keyof typeof MA_COLORS
                items.push({
                  label: `MA${p}`,
                  color: MA_COLORS[colorKey] || MA_COLORS.MA5,
                  value: calcMAAtIndex(klineData, lastIndex, p),
                })
              })
            } else {
              // 默认显示 5, 10, 20, 30, 60
              items.push(
                { label: 'MA5', color: MA_COLORS.MA5, value: calcMAAtIndex(klineData, lastIndex, 5) },
                { label: 'MA10', color: MA_COLORS.MA10, value: calcMAAtIndex(klineData, lastIndex, 10) },
                { label: 'MA20', color: MA_COLORS.MA20, value: calcMAAtIndex(klineData, lastIndex, 20) },
                { label: 'MA30', color: MA_COLORS.MA30, value: calcMAAtIndex(klineData, lastIndex, 30) },
                { label: 'MA60', color: MA_COLORS.MA60, value: calcMAAtIndex(klineData, lastIndex, 60) }
              )
            }

            if (items.length > 0) {
              let x = legendX
              const y = config.yPaddingPx / 2 + fontSize + rowIndex * lineHeight

              ctx.fillStyle = PRICE_COLORS.NEUTRAL
              ctx.fillText('均线', x, y)
              x += ctx.measureText('均线').width + gap

              for (const it of items) {
                const valText = typeof it.value === 'number' ? ` ${it.value.toFixed(2)}` : ''
                const text = `${it.label}${valText}`
                ctx.fillStyle = it.color
                ctx.fillText(text, x, y)
                x += ctx.measureText(text).width + gap
              }
            }
          }
        })
      }

      // BOLL 行
      const bollIndicator = config.indicators.BOLL
      if (bollIndicator?.enabled) {
        rows.push({
          draw: (rowIndex: number) => {
            const period = (bollIndicator.params.period as number) ?? 20
            const multiplier = (bollIndicator.params.multiplier as number) ?? 2
            const boll = calcBOLLAtIndex(klineData, lastIndex, period, multiplier)

            let x = legendX
            const y = config.yPaddingPx / 2 + fontSize + rowIndex * lineHeight

            ctx.fillStyle = PRICE_COLORS.NEUTRAL
            ctx.fillText(`BOLL(${period},${multiplier})`, x, y)
            x += ctx.measureText(`BOLL(${period},${multiplier})`).width + gap

            if (boll) {
              ctx.fillStyle = BOLL_COLORS.UPPER
              ctx.fillText(`上轨:${boll.upper.toFixed(2)}`, x, y)
              x += ctx.measureText(`上轨:${boll.upper.toFixed(2)}`).width + gap

              ctx.fillStyle = BOLL_COLORS.MIDDLE
              ctx.fillText(`中轨:${boll.middle.toFixed(2)}`, x, y)
              x += ctx.measureText(`中轨:${boll.middle.toFixed(2)}`).width + gap

              ctx.fillStyle = BOLL_COLORS.LOWER
              ctx.fillText(`下轨:${boll.lower.toFixed(2)}`, x, y)
            }
          }
        })
      }

      // 按顺序绘制所有行
      rows.forEach((row, index) => row.draw(index))

      ctx.restore()
    },

    getConfig() {
      return {
        yPaddingPx: config.yPaddingPx,
        indicators: { ...config.indicators },
      }
    },

    setConfig(newConfig: Record<string, unknown>) {
      if (typeof newConfig.yPaddingPx === 'number') {
        config.yPaddingPx = newConfig.yPaddingPx
      }
      if (newConfig.indicators && typeof newConfig.indicators === 'object') {
        // 合并而非替换，保留其他指标的配置
        for (const [id, row] of Object.entries(newConfig.indicators) as [string, IndicatorRow][]) {
          if (!config.indicators[id]) {
            config.indicators[id] = { enabled: false, params: {} }
          }
          if (row.enabled !== undefined) {
            config.indicators[id].enabled = row.enabled
          }
          if (row.params) {
            config.indicators[id].params = row.params
          }
        }
      }
    },
  }
}
