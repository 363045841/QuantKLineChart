import type { PriceRange } from './price'

/**
 * Pane 级别的价格坐标系（价格 -> pane 内 Y）
 * - y=0 在 pane 顶部，y=height 在 pane 底部
 */
export class PriceScale {
    private range: PriceRange = { maxPrice: 100, minPrice: 0 }
    private height = 1
    private paddingTop = 0
    private paddingBottom = 0

    /** 价格偏移量（用于上下拖动平移价格轴） */
    private priceOffset = 0

    /** 垂直缩放系数（1=默认，>1 放大，<1 缩小） */
    private verticalScale = 1

    setRange(r: PriceRange) {
        this.range = r
    }

    setHeight(h: number) {
        this.height = Math.max(1, h)
    }

    setPadding(top: number, bottom: number) {
        this.paddingTop = Math.max(0, top)
        this.paddingBottom = Math.max(0, bottom)
    }

    getRange(): PriceRange {
        return this.range
    }

    getPaddingTop(): number {
        return this.paddingTop
    }

    getPaddingBottom(): number {
        return this.paddingBottom
    }

    /**
     * 设置价格偏移量
     * @param offset 价格偏移（正数向上平移，负数向下平移）
     */
    setPriceOffset(offset: number): void {
        this.priceOffset = this.clampOffset(offset)
    }

    /**
     * 获取当前价格偏移量
     */
    getPriceOffset(): number {
        return this.priceOffset
    }

    /**
     * 重置价格偏移量
     */
    resetPriceOffset(): void {
        this.priceOffset = 0
    }

    /**
     * 根据当前 range 和 verticalScale 对 priceOffset 进行 clamp，
     * 防止视口完全离开数据范围。
     */
    private clampOffset(offset: number): number {
        const rangeSize = this.range.maxPrice - this.range.minPrice
        if (rangeSize <= 0) return 0
        const maxOffset = rangeSize * (1 + 1 / this.verticalScale) / 2
        return Math.max(-maxOffset, Math.min(maxOffset, offset))
    }

    /**
     * 按拖拽位移缩放 Y 轴（deltaY < 0 放大，deltaY > 0 缩小）
     */
    scaleByDelta(deltaY: number): void {
        if (!Number.isFinite(deltaY) || deltaY === 0) return
        const factor = Math.exp(-deltaY * 0.01)
        const nextScale = this.verticalScale * factor
        this.verticalScale = Math.min(8, Math.max(0.2, nextScale))
        this.priceOffset = this.clampOffset(this.priceOffset)
    }

    getVerticalScale(): number {
        return this.verticalScale
    }

    getDisplayRange(baseRange?: PriceRange): PriceRange {
        const src = baseRange ?? this.range
        const baseMin = src.minPrice
        const baseMax = src.maxPrice
        const baseRangeSize = baseMax - baseMin || 1
        const centerPrice = (baseMax + baseMin) / 2 + this.priceOffset
        const halfRange = baseRangeSize / (2 * this.verticalScale)
        return {
            maxPrice: centerPrice + halfRange,
            minPrice: centerPrice - halfRange,
        }
    }

    priceToY(price: number): number {
        const { maxPrice, minPrice } = this.range
        // 应用价格偏移
        const adjustedPrice = price - this.priceOffset
        const range = maxPrice - minPrice || 1
        const ratio = (adjustedPrice - minPrice) / range
        const viewHeight = Math.max(1, this.height - this.paddingTop - this.paddingBottom)
        const baseY = this.paddingTop + viewHeight * (1 - ratio)
        const centerY = this.paddingTop + viewHeight / 2
        return centerY + (baseY - centerY) * this.verticalScale
    }

    yToPrice(y: number): number {
        const { maxPrice, minPrice } = this.range
        const range = maxPrice - minPrice || 1
        const viewHeight = Math.max(1, this.height - this.paddingTop - this.paddingBottom)
        const centerY = this.paddingTop + viewHeight / 2
        const unscaledY = centerY + (y - centerY) / this.verticalScale
        const ratio = 1 - (unscaledY - this.paddingTop) / viewHeight
        // 应用价格偏移（反向）
        return minPrice + ratio * range + this.priceOffset
    }

    /**
     * 根据像素偏移计算价格偏移
     * @param deltaY Y轴像素偏移（正数向下拖动）
     * @returns 对应的价格偏移量
     */
    deltaYToPriceOffset(deltaY: number): number {
        const range = this.range.maxPrice - this.range.minPrice || 1
        const viewHeight = Math.max(1, this.height - this.paddingTop - this.paddingBottom)
        // 向下拖动（deltaY > 0）应该让价格轴上移（看到更高的价格）
        // 所以价格偏移 = deltaY * (价格范围 / 视口高度)
        return deltaY * (range / viewHeight)
    }
}

