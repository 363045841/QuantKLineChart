import type { RendererPlugin, RenderContext } from '@/plugin'
import { RENDERER_PRIORITY } from '@/plugin'
import type { KLineData } from '@/types/price'
import type { PriceRange } from '@/core/scale/price'
import { drawMA10Line, drawMA20Line, drawMA5Line, drawMA30Line, drawMA60Line } from '@/utils/kLineDraw/MA'

export type MAFlags = {
    ma5?: boolean
    ma10?: boolean
    ma20?: boolean
    ma30?: boolean
    ma60?: boolean
}

/**
 * 创建 MA 均线渲染器插件
 */
export function createMARendererPlugin(showMA: MAFlags = {}): RendererPlugin {
    const config: MAFlags = {
        ma5: true,
        ma10: true,
        ma20: true,
        ma30: true,
        ma60: true,
        ...showMA,
    }

    return {
        name: 'ma',
        version: '1.0.0',
        description: 'MA均线渲染器',
        debugName: 'MA均线',
        paneId: 'main',
        priority: RENDERER_PRIORITY.INDICATOR,

        draw(context: RenderContext) {
            const { ctx, pane, data, range, scrollLeft, kWidth, kGap, dpr, kLinePositions } = context
            const klineData = data as KLineData[]

            ctx.save()
            ctx.translate(-scrollLeft, 0)

            const opt = { kWidth, kGap, yPaddingPx: 0 }
            const priceRange: PriceRange = pane.priceRange

            if (config.ma5) drawMA5Line(ctx, klineData, opt, pane.height, dpr, range.start, range.end, priceRange, kLinePositions)
            if (config.ma10) drawMA10Line(ctx, klineData, opt, pane.height, dpr, range.start, range.end, priceRange, kLinePositions)
            if (config.ma20) drawMA20Line(ctx, klineData, opt, pane.height, dpr, range.start, range.end, priceRange, kLinePositions)
            if (config.ma30) drawMA30Line(ctx, klineData, opt, pane.height, dpr, range.start, range.end, priceRange, kLinePositions)
            if (config.ma60) drawMA60Line(ctx, klineData, opt, pane.height, dpr, range.start, range.end, priceRange, kLinePositions)

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
