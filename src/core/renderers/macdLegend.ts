import type { RendererPlugin, RenderContext } from '@/plugin'
import { RENDERER_PRIORITY } from '@/plugin'
import type { KLineData } from '@/types/price'
import { TEXT_COLORS, MACD_COLORS } from '@/core/theme/colors'
import { calcMACDAtIndex } from './macd'

export interface MACDLegendOptions {
    /** Y 轴内边距（与主图保持一致） */
    yPaddingPx?: number
}

/**
 * 创建 MACD 图例渲染器插件
 * 在副图左上角显示当前 MACD 指标值
 */
export function createMACDLegendRendererPlugin(options: MACDLegendOptions = {}): RendererPlugin {
    const yPaddingPx = options.yPaddingPx ?? 0

    // 缓存配置（从 MACD 渲染器获取）
    let fastPeriod = 12
    let slowPeriod = 26
    let signalPeriod = 9

    return {
        name: 'macdLegend',
        version: '1.0.0',
        description: 'MACD 图例渲染器',
        debugName: 'MACD 图例',
        paneId: 'sub',
        priority: RENDERER_PRIORITY.FOREGROUND,

        draw(context: RenderContext) {
            const { ctx, data, range } = context
            const klineData = data as KLineData[]
            if (!klineData.length) return

            const lastIndex = Math.min(range.end - 1, klineData.length - 1)
            const macdValue = calcMACDAtIndex(klineData, lastIndex, fastPeriod, slowPeriod, signalPeriod)
            if (!macdValue) return

            const fontSize = 11
            const gap = 12
            let x = 12
            const y = yPaddingPx + fontSize

            ctx.save()
            ctx.font = `${fontSize}px Arial`
            ctx.textAlign = 'left'
            ctx.textBaseline = 'top'

            // 绘制参数显示
            const paramText = `MACD(${fastPeriod},${slowPeriod},${signalPeriod})`
            ctx.fillStyle = TEXT_COLORS.TERTIARY
            ctx.fillText(paramText, x, y)
            x += ctx.measureText(paramText).width + gap

            // 绘制 DIF
            const difText = `DIF:${macdValue.dif.toFixed(2)}`
            ctx.fillStyle = MACD_COLORS.DIF
            ctx.fillText(difText, x, y)
            x += ctx.measureText(difText).width + gap

            // 绘制 DEA
            const deaText = `DEA:${macdValue.dea.toFixed(2)}`
            ctx.fillStyle = MACD_COLORS.DEA
            ctx.fillText(deaText, x, y)
            x += ctx.measureText(deaText).width + gap

            // 绘制 MACD
            const macdText = `MACD:${macdValue.macd.toFixed(2)}`
            ctx.fillStyle = macdValue.macd >= 0 ? MACD_COLORS.BAR_UP : MACD_COLORS.BAR_DOWN
            ctx.fillText(macdText, x, y)

            ctx.restore()
        },

        getConfig() {
            return {
                fastPeriod,
                slowPeriod,
                signalPeriod,
            }
        },

        setConfig(newConfig: Record<string, unknown>) {
            if (typeof newConfig.fastPeriod === 'number') fastPeriod = newConfig.fastPeriod
            if (typeof newConfig.slowPeriod === 'number') slowPeriod = newConfig.slowPeriod
            if (typeof newConfig.signalPeriod === 'number') signalPeriod = newConfig.signalPeriod
        },
    }
}
