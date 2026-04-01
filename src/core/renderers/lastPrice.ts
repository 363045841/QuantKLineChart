import type { PaneRenderer } from '@/core/layout/pane'
import { PRICE_COLORS } from '@/core/theme/colors'

/**
 * 最新价虚线渲染器，绘制在 plotCanvas 的 world 坐标系（需 translate(-scrollLeft,0)）
 */
export const LastPriceLineRenderer: PaneRenderer = {
    draw({ ctx, pane, data, range, scrollLeft, kWidth, kGap, dpr, paneWidth: _paneWidth, kLinePositions }) {
        const last = data[data.length - 1]
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
