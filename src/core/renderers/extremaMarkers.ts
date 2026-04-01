import type { PaneRenderer } from '@/core/layout/pane'
import { roundToPhysicalPixel, createHorizontalLineRect } from '@/core/draw/pixelAlign'
import { TEXT_COLORS, PRICE_COLORS } from '@/core/theme/colors'

/**
 * 可视区最高/最低价标注渲染器（仅绘制标注，不绘制蜡烛）
 * 使用 pane.yAxis.priceToY 作为 Y 映射（与当前 pane 的 priceRange 一致），world 坐标绘制（会 translate(-scrollLeft, 0)）
 */
export const ExtremaMarkersRenderer: PaneRenderer = {
    draw({ ctx, pane, data, range, scrollLeft, kWidth, kGap, dpr, paneWidth, kLinePositions }) {
        if (!data.length) return

        if (pane.id !== 'main') return

        const start = Math.max(0, range.start)
        const end = Math.min(data.length, range.end)
        if (end - start <= 0) return

        let max = -Infinity
        let min = Infinity
        let maxIndex = start
        let minIndex = start

        for (let i = start; i < end; i++) {
            const e = data[i]
            if (!e) continue
            if (e.high >= max) {
                max = e.high
                maxIndex = i
            }
            if (e.low <= min) {
                min = e.low
                minIndex = i
            }
        }

        if (!Number.isFinite(max) || !Number.isFinite(min)) return

        // 使用统一的 kLinePositions 计算 K 线中心 X 坐标
        const getCenterX = (i: number) => {
            const localIdx = i - range.start
            if (localIdx < 0 || localIdx >= kLinePositions.length) return 0
            return kLinePositions[localIdx]! + kWidth / 2
        }

        ctx.save()
        ctx.translate(-scrollLeft, 0)
        drawPriceMarker(ctx, getCenterX(maxIndex), pane.yAxis.priceToY(max), max, dpr, paneWidth, scrollLeft)
        drawPriceMarker(ctx, getCenterX(minIndex), pane.yAxis.priceToY(min), min, dpr, paneWidth, scrollLeft)
        ctx.restore()
    },
}

/**
 * 绘制价格标记
 * @param ctx Canvas 绘图上下文
 * @param x world 坐标横坐标
 * @param y world 坐标纵坐标
 * @param price 价格值
 * @param dpr 设备像素比
 * @param paneWidth pane 宽度
 * @param scrollLeft 滚动偏移量
 */
function drawPriceMarker(ctx: CanvasRenderingContext2D, x: number, y: number, price: number, dpr: number, paneWidth: number, scrollLeft: number) {
    const text = price.toFixed(2)
    const padding = 4
    const lineLength = 30
    const dotRadius = 2

    ctx.font = '12px Arial'
    const textMetrics = ctx.measureText(text)
    const textWidth = textMetrics.width

    const visibleX = x - scrollLeft
    const rightEdge = visibleX + lineLength + padding + textWidth
    const drawLeft = rightEdge > paneWidth
    let lineStartX = x
    let lineEndX = drawLeft ? x - lineLength : x + lineLength
    if (lineStartX > lineEndX) {
        ;[lineStartX, lineEndX] = [lineEndX, lineStartX]
    }
    const lineRect = createHorizontalLineRect(lineStartX, lineEndX, y, dpr)
    if (lineRect) {
        ctx.fillStyle = TEXT_COLORS.WEAK
        ctx.fillRect(lineRect.x, lineRect.y, lineRect.width, lineRect.height)
    }

    const endX = roundToPhysicalPixel(lineEndX, dpr)
    const alignedY = roundToPhysicalPixel(y, dpr)
    ctx.fillStyle = TEXT_COLORS.WEAK
    ctx.beginPath()
    ctx.arc(endX, alignedY, dotRadius, 0, Math.PI * 2)
    ctx.fill()
    ctx.font = '12px Arial'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = PRICE_COLORS.NEUTRAL

    if (drawLeft) {
        ctx.textAlign = 'right'
        ctx.fillText(text, roundToPhysicalPixel(x - lineLength - padding, dpr), roundToPhysicalPixel(y, dpr))
    } else {
        ctx.textAlign = 'left'
        ctx.fillText(text, roundToPhysicalPixel(x + lineLength + padding, dpr), roundToPhysicalPixel(y, dpr))
    }
}
