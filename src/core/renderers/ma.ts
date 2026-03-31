import type { PaneRenderer } from '@/core/layout/pane'
import { drawMA10Line, drawMA20Line, drawMA5Line, drawMA30Line, drawMA60Line } from '@/utils/kLineDraw/MA'

export type MAFlags = {
    ma5?: boolean
    ma10?: boolean
    ma20?: boolean
    ma30?: boolean
    ma60?: boolean
}

/**
 * 创建 MA 渲染器，复用 drawMA*Line（world 坐标绘制：需 translate(-scrollLeft,0)）
 * drawMA*Line 内部使用 priceToY + priceRange，因此可直接用 pane.priceRange
 * @param showMA 显示哪些均线的标志
 * @returns PaneRenderer 实例
 */
export function createMARenderer(showMA: MAFlags): PaneRenderer {
    return {
        draw({ ctx, pane, data, range, scrollLeft, kWidth, kGap, dpr, paneWidth: _paneWidth, kLinePositions }) {
            ctx.save()
            ctx.translate(-scrollLeft, 0)

            const opt = { kWidth, kGap, yPaddingPx: 0 }
            if (showMA.ma5) drawMA5Line(ctx, data, opt, pane.height, dpr, range.start, range.end, pane.priceRange, kLinePositions)
            if (showMA.ma10) drawMA10Line(ctx, data, opt, pane.height, dpr, range.start, range.end, pane.priceRange, kLinePositions)
            if (showMA.ma20) drawMA20Line(ctx, data, opt, pane.height, dpr, range.start, range.end, pane.priceRange, kLinePositions)
            if (showMA.ma30) drawMA30Line(ctx, data, opt, pane.height, dpr, range.start, range.end, pane.priceRange, kLinePositions)
            if (showMA.ma60) drawMA60Line(ctx, data, opt, pane.height, dpr, range.start, range.end, pane.priceRange, kLinePositions)

            ctx.restore()
        },
    }
}
