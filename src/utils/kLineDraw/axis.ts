import type { KLineData } from '@/types/price'
import { priceToY, yToPrice } from '../priceToY'
import { alignToPhysicalPixelCenter, roundToPhysicalPixel } from '@/core/draw/pixelAlign'
import { formatYMDShanghai, formatMonthOrYear, monthKey, findMonthBoundaries } from '@/utils/dateFormat'
import { TAG_BG_COLORS, BORDER_COLORS, TEXT_COLORS, CROSSHAIR_COLORS, getTickColor } from '@/core/theme/colors'

export interface PriceAxisOptions {
    x: number
    y: number
    width: number
    height: number
    priceRange: { maxPrice: number; minPrice: number }
    yPaddingPx?: number
    dpr: number
    ticks?: number
    bgColor?: string
    textColor?: string
    lineColor?: string
    fontSize?: number
    paddingX?: number
    /** 是否绘制左侧边界竖线（默认 true） */
    drawLeftBorder?: boolean
    /** 是否绘制刻度短线（默认 true） */
    drawTickLines?: boolean
    /** 价格偏移量（用于价格轴平移时同步显示） */
    priceOffset?: number
}

/** 右侧价格轴（固定，不随 translate/scroll 变化） */
export function drawPriceAxis(ctx: CanvasRenderingContext2D, opts: PriceAxisOptions) {
    const {
        x,
        y,
        width,
        height,
        priceRange,
        yPaddingPx = 0,
        dpr,
        ticks = 10,
        bgColor = TAG_BG_COLORS.TRANSPARENT,
        textColor = TEXT_COLORS.SECONDARY,
        lineColor = BORDER_COLORS.DARK,
        fontSize = 16,
        drawLeftBorder = true,
        drawTickLines = true,
        priceOffset = 0,
    } = opts

    const wantPad = yPaddingPx
    const pad = Math.max(0, Math.min(wantPad, Math.floor(height / 2) - 1))

    const { maxPrice, minPrice } = priceRange
    const range = maxPrice - minPrice
    const step = range === 0 ? 0 : range / (Math.max(2, ticks) - 1)

    // 背景
    ctx.fillStyle = bgColor
    ctx.fillRect(x, y, width, height)

    // 左边界线
    if (drawLeftBorder) {
        ctx.strokeStyle = lineColor
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(alignToPhysicalPixelCenter(x, dpr), y)
        ctx.lineTo(alignToPhysicalPixelCenter(x, dpr), y + height)
        ctx.stroke()
    }

    ctx.font = `${fontSize}px -apple-system,BlinkMacSystemFont,Trebuchet MS,Roboto,Ubuntu,sans-serif`
    ctx.textBaseline = 'middle'
    // 价格轴文字水平居中
    ctx.textAlign = 'center'

    const centerX = x + width / 2

    for (let i = 0; i < Math.max(2, ticks); i++) {
        const p = range === 0 ? maxPrice : maxPrice - step * i
        // 统一对 y 做一次四舍五入，减少与 gridLines 的 1px 级误差
        const yy = Math.round(priceToY(p, maxPrice, minPrice, height, pad, pad) + y)

        // 刻度短线
        if (drawTickLines) {
            ctx.strokeStyle = lineColor
            ctx.beginPath()
            const lineY = alignToPhysicalPixelCenter(yy, dpr)

            ctx.moveTo(x, lineY)
            ctx.lineTo(x + 4, lineY)
            ctx.stroke()
        }

        // 文字：显示平移后的价格
        const displayPrice = p + priceOffset
        ctx.fillStyle = textColor
        ctx.fillText(displayPrice.toFixed(2), roundToPhysicalPixel(centerX, dpr), roundToPhysicalPixel(yy, dpr))
    }
}

export interface TimeAxisOptions {
    x: number
    y: number
    width: number
    height: number
    data: KLineData[]
    scrollLeft: number
    kWidth: number
    kGap: number
    startIndex: number
    endIndex: number
    dpr: number
    bgColor?: string
    textColor?: string
    lineColor?: string
    fontSize?: number
    /** 左右内边距（逻辑像素），避免月份/年份文字贴边 */
    paddingX?: number
    /** 是否绘制顶部边界线（默认 true，如果主图已有底边框则设为 false 避免重复） */
    drawTopBorder?: boolean
    /** 是否绘制底部边界线（默认 true，如果副图已有下边框则设为 false 避免重复） */
    drawBottomBorder?: boolean
}

export interface LastPriceLineOptions {
    /** 绘图区宽度（逻辑像素） */
    plotWidth: number
    /** 绘图区高度（逻辑像素） */
    plotHeight: number
    /** 当前滚动位置（逻辑像素） */
    scrollLeft: number
    /** 可视范围：用于确定虚线的起止 worldX */
    startIndex: number
    endIndex: number
    /** K线布局 */
    kWidth: number
    kGap: number
    /** 价格范围 */
    priceRange: { maxPrice: number; minPrice: number }
    /** 最新价 */
    lastPrice: number
    /** Y轴 padding（与绘图区一致） */
    yPaddingPx?: number
    dpr: number
    color?: string
}

export interface CrosshairPriceLabelOptions {
    x: number
    y: number
    width: number
    height: number
    /** 十字线的 y（相对该 canvas 的逻辑像素坐标） */
    crosshairY: number
    priceRange: { maxPrice: number; minPrice: number }
    yPaddingPx?: number
    dpr: number
    bgColor?: string
    textColor?: string
    fontSize?: number
    paddingX?: number
    /** 价格偏移量（用于价格轴平移时同步显示） */
    priceOffset?: number
    /** 优先显示的价格（如十字线已按 active pane 算好） */
    price?: number
}

export interface CrosshairTimeLabelOptions {
    x: number
    y: number
    width: number
    height: number
    /** 十字线的 x（相对该 canvas 的逻辑像素坐标） */
    crosshairX: number
    /** 命中的交易日时间戳（毫秒） */
    timestamp: number
    dpr: number
    bgColor?: string
    textColor?: string
    fontSize?: number
    paddingX?: number
    paddingY?: number
}

/**
 * 在底部时间轴上绘制"十字线日期标签"
 * 说明：该函数假设时间轴背景/刻度已绘制完（即 drawTimeAxis 之后调用）。
 */
export function drawCrosshairTimeLabel(ctx: CanvasRenderingContext2D, opts: CrosshairTimeLabelOptions) {
    const {
        x,
        y,
        width,
        height,
        crosshairX,
        timestamp,
        dpr,
        fontSize = 16,
        paddingX = 8,
    } = opts

    const text = formatYMDShanghai(timestamp)

    ctx.save()
    ctx.font = `${fontSize}px -apple-system,BlinkMacSystemFont,Trebuchet MS,Roboto,Ubuntu,sans-serif`
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'center'

    const tw = Math.round(ctx.measureText(text).width)
    const rectW = Math.min(width, tw + paddingX * 2)
    const rectH = height

    const centerX = Math.min(Math.max(crosshairX, x + rectW / 2), x + width - rectW / 2)
    const centerY = y + height / 2

    const rectX = centerX - rectW / 2
    const rectY = y

    // 背景条（黑色，占满整个时间轴高度）
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)'
    ctx.fillRect(
        roundToPhysicalPixel(rectX, dpr),
        roundToPhysicalPixel(rectY, dpr),
        roundToPhysicalPixel(rectW, dpr),
        roundToPhysicalPixel(rectH, dpr),
    )

    // 文字（白色）
    ctx.fillStyle = '#ffffff'
    ctx.fillText(text, roundToPhysicalPixel(centerX, dpr), roundToPhysicalPixel(centerY, dpr))

    ctx.restore()
}

/**
 * 在右侧价格轴上绘制"十字线价格标签"
 * 说明：该函数假设价格轴背景/刻度已绘制完（即 drawPriceAxis 之后调用）。
 */
export function drawCrosshairPriceLabel(ctx: CanvasRenderingContext2D, opts: CrosshairPriceLabelOptions) {
    const {
        x,
        y,
        width,
        height,
        crosshairY,
        priceRange,
        yPaddingPx = 0,
        dpr,
        fontSize = 16,
        priceOffset = 0,
        price,
    } = opts

    const pad = Math.max(0, Math.min(yPaddingPx, Math.floor(height / 2) - 1))
    const { maxPrice, minPrice } = priceRange

    // 优先使用外部传入价格（active pane 已计算），否则按当前 pane 反算并应用偏移
    const displayPrice = price ?? (yToPrice(crosshairY - y, maxPrice, minPrice, height, pad, pad) + priceOffset)
    const priceText = displayPrice.toFixed(2)

    ctx.save()
    ctx.font = `${fontSize}px -apple-system,BlinkMacSystemFont,Trebuchet MS,Roboto,Ubuntu,sans-serif`
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'center'

    const textH = fontSize + 4
    const rectH = textH

    const yy = Math.min(Math.max(crosshairY, y + rectH / 2), y + height - rectH / 2)
    const rectY = yy - rectH / 2

    // 背景条（黑色，占满整个轴宽度）
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)'
    const rx = x
    const ry = roundToPhysicalPixel(rectY, dpr)
    const rw = width
    const rh = roundToPhysicalPixel(rectH, dpr)
    ctx.fillRect(rx, ry, rw, rh)

    // 绘制价格文字（白色，水平居中）
    const centerX = x + width / 2
    ctx.fillStyle = '#ffffff'
    ctx.fillText(priceText, roundToPhysicalPixel(centerX, dpr), roundToPhysicalPixel(yy, dpr))

    ctx.restore()
}

/** 绘制"最新价水平虚线"（画在 plotCanvas 的 world 坐标系：需在 translate(-scrollLeft,0) 之后调用） */
export function drawLastPriceDashedLine(ctx: CanvasRenderingContext2D, opts: LastPriceLineOptions) {
    const {
        plotWidth,
        plotHeight,
        scrollLeft,
        startIndex,
        endIndex,
        kWidth,
        kGap,
        priceRange,
        lastPrice,
        yPaddingPx = 0,
        dpr,
        color = CROSSHAIR_COLORS.LINE,
    } = opts

    const { maxPrice, minPrice } = priceRange
    if (!(lastPrice >= minPrice && lastPrice <= maxPrice)) return

    const pad = Math.max(0, Math.min(yPaddingPx, Math.floor(plotHeight / 2) - 1))
    const y = priceToY(lastPrice, maxPrice, minPrice, plotHeight, pad, pad)

    const unit = kWidth + kGap
    const startX = kGap + startIndex * unit
    const endX = kGap + endIndex * unit

    ctx.save()
    ctx.strokeStyle = color
    ctx.lineWidth = 1
    ctx.setLineDash([4, 3])
    ctx.beginPath()
    const yy = alignToPhysicalPixelCenter(y, dpr)
    ctx.moveTo(roundToPhysicalPixel(startX, dpr), yy)
    ctx.lineTo(roundToPhysicalPixel(endX, dpr), yy)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.restore()
}

/** 底部时间轴（X方向随 scrollLeft 变化） */
export function drawTimeAxis(ctx: CanvasRenderingContext2D, opts: TimeAxisOptions) {
    const {
        x,
        y,
        width,
        height,
        data,
        scrollLeft,
        kWidth,
        kGap,
        startIndex,
        endIndex,
        dpr,
        bgColor = TAG_BG_COLORS.TRANSPARENT,
        textColor = TEXT_COLORS.SECONDARY,
        lineColor = BORDER_COLORS.DARK,
        fontSize = 12,
        paddingX = 8,
        drawTopBorder = true,
        drawBottomBorder = true,
    } = opts

    // 使用物理像素对齐后的单位，与 getPhysicalKLineConfig 保持一致
    const physKWidth = Math.round(kWidth * dpr)
    const alignedPhysKWidth = physKWidth % 2 === 0 ? physKWidth + 1 : physKWidth
    const physKGap = Math.round(kGap * dpr)
    const unitPx = alignedPhysKWidth + physKGap
    const startXPx = physKGap // 第一根 K 线左侧的间距

    // 转换到逻辑像素空间
    const unit = unitPx / dpr
    const startX = startXPx / dpr
    const alignedKWidth = alignedPhysKWidth / dpr

    // 背景
    ctx.fillStyle = bgColor
    ctx.fillRect(x, y, width, height)

    // 上边界线（如果主图已有底边框则不绘制）
    if (drawTopBorder) {
        ctx.strokeStyle = lineColor
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(x, alignToPhysicalPixelCenter(y, dpr))
        ctx.lineTo(x + width, alignToPhysicalPixelCenter(y, dpr))
        ctx.stroke()
    }

    // 下边界线（如果副图已有下边框则不绘制）
    if (drawBottomBorder) {
        ctx.strokeStyle = lineColor
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(x, alignToPhysicalPixelCenter(y + height, dpr))
        ctx.lineTo(x + width, alignToPhysicalPixelCenter(y + height, dpr))
        ctx.stroke()
    }

    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    // 考虑底部边框 1px，文字往下移 1px
    const textY = y + height / 2 + 1

    // 使用预计算的月边界
    const boundaries = findMonthBoundaries(data)

    // 只考虑可视范围内的边界
    const visibleBoundaries = boundaries.filter((idx: number) => idx >= startIndex && idx < endIndex)

    for (const idx of visibleBoundaries) {
        const k = data[idx]
        if (!k) continue

        // 使用与 calcKLinePositions 一致的坐标计算
        const worldX = startX + idx * unit + alignedKWidth / 2
        const screenX = worldX - scrollLeft

        // 避免文字/刻度贴边：按左右 padding 收紧可绘制区域
        const minX = paddingX
        const maxX = Math.max(paddingX, width - paddingX)

        if (screenX >= minX && screenX <= maxX) {
            const drawX = Math.min(Math.max(screenX, minX), maxX)

            const { text, isYear } = formatMonthOrYear(k.timestamp)
            ctx.fillStyle = textColor
            ctx.font = `${isYear ? 'bold ' : ''}${fontSize}px -apple-system,BlinkMacSystemFont,Trebuchet MS,Roboto,Ubuntu,sans-serif`
            ctx.fillText(text, roundToPhysicalPixel(drawX, dpr), roundToPhysicalPixel(textY, dpr))
        }
    }
}
