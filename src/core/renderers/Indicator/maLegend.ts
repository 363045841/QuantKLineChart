import type { RendererPlugin, RenderContext } from '@/plugin'
import { RENDERER_PRIORITY } from '@/plugin'
import type { MAFlags } from './ma'
import type { KLineData } from '@/types/price'
import { calcMAAtIndex } from '@/utils/kline/ma'
import { MA_COLORS, PRICE_COLORS } from '@/core/theme/colors'

/**
 * 创建 MA 图例渲染器插件
 */
export function createMALegendRendererPlugin(options: {
  yPaddingPx: number
  showMA?: MAFlags
}): RendererPlugin {
  const showMA: MAFlags = {
    ma5: true,
    ma10: true,
    ma20: true,
    ma30: true,
    ma60: true,
    ...options.showMA,
  }

  return {
    name: 'maLegend',
    version: '1.0.0',
    description: 'MA均线图例渲染器',
    debugName: 'MA图例',
    paneId: 'main',
    priority: RENDERER_PRIORITY.FOREGROUND,

    draw(context: RenderContext) {
      const { ctx, data, range } = context
      const klineData = data as KLineData[]
      if (!klineData.length) return

      const legendX = 12
      const fontSize = 12
      const legendY = (fontSize + options.yPaddingPx) / 2
      const gap = 10

      ctx.save()
      ctx.font = `${fontSize}px Arial`
      ctx.textAlign = 'left'

      const lastIndex = Math.min(range.end - 1, klineData.length - 1)

      const items: Array<{ label: string; color: string; value?: number }> = []
      if (showMA.ma5) items.push({ label: 'MA5', color: MA_COLORS.MA5, value: calcMAAtIndex(klineData, lastIndex, 5) })
      if (showMA.ma10) items.push({ label: 'MA10', color: MA_COLORS.MA10, value: calcMAAtIndex(klineData, lastIndex, 10) })
      if (showMA.ma20) items.push({ label: 'MA20', color: MA_COLORS.MA20, value: calcMAAtIndex(klineData, lastIndex, 20) })
      if (showMA.ma30) items.push({ label: 'MA30', color: MA_COLORS.MA30, value: calcMAAtIndex(klineData, lastIndex, 30) })
      if (showMA.ma60) items.push({ label: 'MA60', color: MA_COLORS.MA60, value: calcMAAtIndex(klineData, lastIndex, 60) })

      if (items.length > 0) {
        let x = legendX
        const y = legendY

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

      ctx.restore()
    },

    getConfig() {
      return { ...showMA }
    },

    setConfig(newConfig: Record<string, unknown>) {
      Object.assign(showMA, newConfig)
    },
  }
}
