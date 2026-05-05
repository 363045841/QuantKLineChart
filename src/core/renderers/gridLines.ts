import type { RendererPlugin, RenderContext } from '@/plugin'
import { RENDERER_PRIORITY, GLOBAL_PANE_ID } from '@/plugin'
import type { KLineData } from '@/types/price'
import { createHorizontalLineRect, createVerticalLineRect } from '@/core/draw/pixelAlign'
import { findMonthBoundaries } from '@/utils/dateFormat'
import { GRID_COLORS } from '@/core/theme/colors'
import { calculateTickCount } from '@/core/utils/tickCount'

/**
 * 创建网格线渲染器插件
 * 横向按像素均分铺满整个绘图区高度，纵向按月分割（使用预计算的月边界，网格线对齐到K线实体中部）
 * 渲染到所有 pane（使用 GLOBAL_PANE_ID）
 */
export function createGridLinesRendererPlugin(): RendererPlugin {
    return {
        name: 'gridLines',
        version: '1.0.0',
        description: '网格线渲染器',
        debugName: '网格线',
        paneId: GLOBAL_PANE_ID,
        priority: RENDERER_PRIORITY.GRID,

        draw(context: RenderContext) {
            const { ctx, pane, data, range, scrollLeft, kWidth, dpr, kLinePositions } = context
            const klineData = data as KLineData[]
            if (!klineData.length) return

            const tickCount = calculateTickCount(pane.height)

            ctx.save()
            ctx.fillStyle = GRID_COLORS.HORIZONTAL
            ctx.translate(-scrollLeft, 0)

            const plotWidth = ctx.canvas.width / dpr
            const startX = scrollLeft
            const endX = scrollLeft + plotWidth
            const pt = pane.yAxis.getPaddingTop()
            const pb = pane.yAxis.getPaddingBottom()

            const yStart = pt
            const yEnd = Math.max(pt, pane.height - pb)
            const viewH = Math.max(0, yEnd - yStart)

            for (let i = 0; i < tickCount; i++) {
                const t = tickCount <= 1 ? 0 : i / (tickCount - 1)
                const y = Math.round(yStart + t * viewH)

                const h = createHorizontalLineRect(startX, endX, y, dpr)
                if (h) ctx.fillRect(h.x, h.y, h.width, h.height)
            }

            const boundaries = findMonthBoundaries(klineData)

            for (const idx of boundaries) {
                if (idx < range.start || idx >= range.end || idx >= klineData.length) continue

                // 使用统一的 kLinePositions 计算 K 线中心 X 坐标
                const localIdx = idx - range.start
                if (localIdx < 0 || localIdx >= kLinePositions.length) continue
                const worldX = kLinePositions[localIdx]! + kWidth / 2

                const v = createVerticalLineRect(worldX, 0, pane.height, dpr)
                if (v) ctx.fillRect(v.x, v.y, v.width, v.height)
            }

            ctx.restore()
        },
    }
}
