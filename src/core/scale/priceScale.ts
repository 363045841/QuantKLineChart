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

    priceToY(price: number): number {
        const { maxPrice, minPrice } = this.range
        const range = maxPrice - minPrice || 1
        const ratio = (price - minPrice) / range
        const viewHeight = Math.max(1, this.height - this.paddingTop - this.paddingBottom)
        return this.paddingTop + viewHeight * (1 - ratio)
    }

    yToPrice(y: number): number {
        const { maxPrice, minPrice } = this.range
        const range = maxPrice - minPrice || 1
        const viewHeight = Math.max(1, this.height - this.paddingTop - this.paddingBottom)
        const ratio = 1 - (y - this.paddingTop) / viewHeight
        return minPrice + ratio * range
    }
}

