import type { RendererPlugin, RenderContext } from '@/plugin'
import { RENDERER_PRIORITY } from '@/plugin'
import type { KLineData } from '@/types/price'
import { calcBOLLAtIndex } from '@/core/renderers/boll'
import { BOLL_COLORS, PRICE_COLORS } from '@/core/theme/colors'

export interface BOLLLegendConfig {
    /** 周期（默认20） */
    period?: number
    /** 标准差倍数（默认2） */
    multiplier?: number
    /** 是否显示图例 */
    show?: boolean
}

/**
 * 创建 BOLL 图例渲染器插件
 */
export function createBOLLLegendRendererPlugin(options: {
    yPaddingPx: number
    config?: BOLLLegendConfig
}): RendererPlugin {
    const config: Required<BOLLLegendConfig> = {
        period: 20,
        multiplier: 2,
        show: true,
        ...options.config,
    }

    return {
        name: 'bollLegend',
        version: '1.0.0',
        description: 'BOLL布林带图例渲染器',
        debugName: 'BOLL图例',
        paneId: 'main',
        priority: RENDERER_PRIORITY.FOREGROUND,

        draw(context: RenderContext) {
            if (!config.show) return

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
            const boll = calcBOLLAtIndex(klineData, lastIndex, config.period, config.multiplier)

            let x = legendX

            // 绘制 "BOLL" 标签
            ctx.fillStyle = PRICE_COLORS.NEUTRAL
            ctx.fillText(`BOLL(${config.period},${config.multiplier})`, x, legendY)
            x += ctx.measureText(`BOLL(${config.period},${config.multiplier})`).width + gap

            // 绘制上轨
            if (boll) {
                ctx.fillStyle = BOLL_COLORS.UPPER
                ctx.fillText(`上轨:${boll.upper.toFixed(2)}`, x, legendY)
                x += ctx.measureText(`上轨:${boll.upper.toFixed(2)}`).width + gap

                // 绘制中轨
                ctx.fillStyle = BOLL_COLORS.MIDDLE
                ctx.fillText(`中轨:${boll.middle.toFixed(2)}`, x, legendY)
                x += ctx.measureText(`中轨:${boll.middle.toFixed(2)}`).width + gap

                // 绘制下轨
                ctx.fillStyle = BOLL_COLORS.LOWER
                ctx.fillText(`下轨:${boll.lower.toFixed(2)}`, x, legendY)
            }

            ctx.restore()
        },

        getConfig() {
            return { ...config }
        },

        setConfig(newConfig: Record<string, unknown>) {
            Object.assign(config, newConfig)
        },
    }
}
