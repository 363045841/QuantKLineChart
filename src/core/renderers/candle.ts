import type { RendererPlugin, RenderContext } from '@/plugin'
import { RENDERER_PRIORITY } from '@/plugin'
import type { KLineData } from '@/types/price'
import { getKLineTrend, type kLineTrend } from '@/types/kLine'
import { createAlignedKLineFromPx, createVerticalLineRect } from '@/core/draw/pixelAlign'
import { PRICE_COLORS } from '@/core/theme/colors'
import { getPhysicalKLineConfig } from '@/core/chart'
import { VolumePriceRelation } from '@/types/volumePrice'
import { analyzeVolumePriceRelationBatch, DEFAULT_VOLUME_PRICE_CONFIG } from '@/utils/volumePrice'
import type { MarkerManager } from '@/core/marker/registry'

/**
 * 创建 K 线蜡烛图渲染器插件
 */
export function createCandleRenderer(): RendererPlugin {
    return {
        name: 'candle',
        version: '1.0.0',
        description: 'K线蜡烛图渲染器',
        debugName: 'K线',
        paneId: 'main',
        priority: RENDERER_PRIORITY.MAIN,

        draw(context: RenderContext) {
            const { ctx, pane, data, range, scrollLeft, kWidth, kGap, dpr, kLinePositions, markerManager } = context
            const klineData = data as KLineData[]
            if (!klineData.length) return

            const { kWidthPx } = getPhysicalKLineConfig(kWidth, kGap, dpr)

            ctx.save()
            ctx.translate(-scrollLeft, 0)

            const positions = kLinePositions || []

            // 批量计算量价关系，使用前缀和优化性能
            const relations = analyzeVolumePriceRelationBatch(
                klineData,
                range.start,
                range.end,
                DEFAULT_VOLUME_PRICE_CONFIG
            )

            for (let i = range.start; i < range.end && i < klineData.length; i++) {
                const e = klineData[i]
                if (!e) continue

                const openY = pane.yAxis.priceToY(e.open)
                const closeY = pane.yAxis.priceToY(e.close)
                const highY = pane.yAxis.priceToY(e.high)
                const lowY = pane.yAxis.priceToY(e.low)

                const rawRectY = Math.min(openY, closeY)
                const rawRectH = Math.max(Math.abs(openY - closeY), 1)

                // 使用 Chart 统一计算的 x 坐标
                const leftLogical = positions[i - range.start]
                if (!leftLogical) continue
                const aligned = createAlignedKLineFromPx(
                    Math.round(leftLogical * dpr),
                    rawRectY,
                    kWidthPx,
                    rawRectH,
                    dpr
                )

                const trend: kLineTrend = getKLineTrend(e)
                const color = trend === 'up' ? PRICE_COLORS.UP : PRICE_COLORS.DOWN

                ctx.fillStyle = color
                ctx.fillRect(aligned.bodyRect.x, aligned.bodyRect.y, aligned.bodyRect.width, aligned.bodyRect.height)

                const wickWidth = aligned.wickRect.width
                const wickX = aligned.wickRect.x
                const bodyTop = aligned.bodyRect.y
                const bodyBottom = aligned.bodyRect.y + aligned.bodyRect.height
                const bodyHigh = Math.max(e.open, e.close)
                const bodyLow = Math.min(e.open, e.close)

                if (e.high > bodyHigh) {
                    const wick = createVerticalLineRect(wickX, highY, bodyTop, dpr)
                    if (wick) ctx.fillRect(wick.x, wick.y, wickWidth, wick.height)
                }
                if (e.low < bodyLow) {
                    const wick = createVerticalLineRect(wickX, bodyBottom, lowY, dpr)
                    if (wick) ctx.fillRect(wick.x, wick.y, wickWidth, wick.height)
                }

                // 绘制量价关系标记
                const relation = relations[i - range.start]
                if (relation !== VolumePriceRelation.OTHERS && markerManager) {
                    // 根据量价关系决定标记位置
                    const isRising = relation === VolumePriceRelation.RISE_WITH_VOLUME ||
                        relation === VolumePriceRelation.RISE_WITHOUT_VOLUME
                    const markerY = isRising ? highY - 15 : lowY + 15
                    const markerX = aligned.bodyRect.x + aligned.bodyRect.width / 2

                    drawVolumePriceMarker(ctx, markerX, markerY, relation!, i, kWidth, 4, markerManager as MarkerManager)
                }
            }

            ctx.restore()
        },
    }
}

/**
* 绘制量价关系标记
* 在K线图上标注量价关系标记符号
*
* @param ctx - Canvas绘图上下文
* @param x - 标记的x坐标（三角形水平中心）
* @param y - 标记的y坐标（三角形底边/顶点与K线的接触点）
* @param relation - 量价关系类型
* @param kWidth - K线宽度，作为三角形边长
* @param gap - 三角形与K线的间距，默认为4
*/
export function drawVolumePriceMarker(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    relation: VolumePriceRelation,
    kIndex: number,
    kWidth: number,
    gap: number = 4,
    markerManager: MarkerManager
): void {
    const sideLength = Math.min(kWidth, 20)
    // 等边三角形的高度 = 边长 * √3 / 2
    const height = sideLength * Math.sqrt(3) / 2

    let color: string
    let isUp: boolean

    switch (relation) {
        case VolumePriceRelation.RISE_WITH_VOLUME:
            // 量价齐升 - 红色向上箭头
            color = '#FF4444'
            isUp = true
            break
        case VolumePriceRelation.RISE_WITHOUT_VOLUME:
            // 缩量上涨 - 绿色向上箭头
            color = '#00C853'
            isUp = true
            break
        case VolumePriceRelation.FALL_WITH_VOLUME:
            // 放量下跌 - 红色向下箭头
            color = '#FF4444'
            isUp = false
            break
        case VolumePriceRelation.FALL_WITHOUT_VOLUME:
            // 缩量下跌 - 绿色向下箭头
            color = '#00C853'
            isUp = false
            break
        default:
            return
    }

    ctx.save()
    ctx.beginPath()

    if (isUp) {
        // 向上三角形：底边在下，顶点在上
        // y 是 highY，三角形底边距离 highY 有 gap 的间距
        const baseY = y - gap           // 底边 y 坐标
        const tipY = baseY - height     // 顶点 y 坐标

        ctx.moveTo(x, tipY)                          // 顶点
        ctx.lineTo(x - sideLength / 2, baseY)        // 左下角
        ctx.lineTo(x + sideLength / 2, baseY)        // 右下角
    } else {
        // 向下三角形：底边在上，顶点在下
        // y 是 lowY，三角形底边距离 lowY 有 gap 的间距
        const baseY = y + gap           // 底边 y 坐标
        const tipY = baseY + height     // 顶点 y 坐标

        ctx.moveTo(x, tipY)                          // 顶点
        ctx.lineTo(x - sideLength / 2, baseY)        // 左上角
        ctx.lineTo(x + sideLength / 2, baseY)        // 右上角
    }

    ctx.closePath()

    ctx.fillStyle = color
    ctx.fill()

    ctx.restore()

    // 计算三角形的包围盒坐标
    let boundingX: number
    let boundingY: number

    if (isUp) {
        // 向上三角形：底边在下，顶点在上
        const baseY = y - gap           // 底边 y 坐标
        const tipY = baseY - height     // 顶点 y 坐标
        boundingX = x - sideLength / 2  // 左上角 x
        boundingY = tipY                 // 左上角 y（顶点 y）
    } else {
        // 向下三角形：底边在上，顶点在下
        const baseY = y + gap           // 底边 y 坐标
        const tipY = baseY + height     // 顶点 y 坐标
        boundingX = x - sideLength / 2  // 左上角 x
        boundingY = baseY                // 左上角 y（底边 y）
    }

    // 根据 VolumePriceRelation 获取对应的 markerType
    let markerTypeKey: string
    switch (relation) {
        case VolumePriceRelation.RISE_WITH_VOLUME:
            markerTypeKey = 'RISE_WITH_VOLUME'
            break
        case VolumePriceRelation.RISE_WITHOUT_VOLUME:
            markerTypeKey = 'RISE_WITHOUT_VOLUME'
            break
        case VolumePriceRelation.FALL_WITH_VOLUME:
            markerTypeKey = 'FALL_WITH_VOLUME'
            break
        case VolumePriceRelation.FALL_WITHOUT_VOLUME:
            markerTypeKey = 'FALL_WITHOUT_VOLUME'
            break
        default:
            return
    }

    const markerId = `mk_price-volume_${kIndex}`
    markerManager.register({
        id: markerId,
        type: 'triangle',
        markerType: markerTypeKey,
        x: boundingX,
        y: boundingY,
        width: sideLength,
        height: height,
        dataIndex: kIndex,
        metadata: { relation }
    })
}
