import type { RendererPlugin, RenderContext } from '@/plugin'
import { RENDERER_PRIORITY } from '@/plugin'
import type { KLineData } from '@/types/price'
import { PRICE_COLORS } from '@/core/theme/colors'

/**
 * 创建最新价虚线渲染器插件
 */
export function createLastPriceLineRendererPlugin(): RendererPlugin {
    return {
        name: 'lastPriceLine',
        version: '1.0.0',
        description: '最新价虚线渲染器',
        debugName: '最新价线',
        paneId: 'main',
        priority: RENDERER_PRIORITY.FOREGROUND,

        draw(context: RenderContext) {
            const { ctx, pane, data, scrollLeft, kWidth, dpr, kLinePositions } = context
            const klineData = data as KLineData[]
            const last = klineData[klineData.length - 1]
            if (!last) return

            ctx.save()
            ctx.translate(-scrollLeft, 0)

            const y = Math.round(pane.yAxis.priceToY(last.close))

            // 使用统一的 kLinePositions 计算绘制范围
            const startX = kLinePositions[0] ?? 0
            const endX = (kLinePositions[kLinePositions.length - 1] ?? 0) + kWidth

            ctx.strokeStyle = PRICE_COLORS.LAST_PRICE
            ctx.lineWidth = 1
            ctx.setLineDash([4, 3])
            ctx.beginPath()
            const yy = (Math.floor(y * dpr) + 0.5) / dpr
            ctx.moveTo(Math.round(startX * dpr) / dpr, yy)
            ctx.lineTo(Math.round(endX * dpr) / dpr, yy)
            ctx.stroke()
            ctx.setLineDash([])

            ctx.restore()
        },
    }
}
