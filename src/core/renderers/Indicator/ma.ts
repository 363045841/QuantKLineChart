import type { RendererPlugin, RenderContext } from '@/plugin'
import { RENDERER_PRIORITY } from '@/plugin'
import type { KLineData } from '@/types/price'
import { alignToPhysicalPixelCenter } from '@/core/draw/pixelAlign'
import { MA_COLORS } from '@/core/theme/colors'

export type MAFlags = {
    ma5?: boolean
    ma10?: boolean
    ma20?: boolean
    ma30?: boolean
    ma60?: boolean
}

interface MACache {
    period: number
    values: (number | undefined)[]
}

/**
 * 计算指定周期的 MA 数据（使用滑动窗口优化）
 */
function calcMAData(data: KLineData[], period: number): (number | undefined)[] {
    const result: (number | undefined)[] = new Array(data.length)

    if (data.length < period) return result

    // 滑动窗口求和
    let sum = 0

    // 初始化第一个窗口
    for (let i = 0; i < period; i++) {
        const item = data[i]
        if (!item) return result
        sum += item.close
    }

    // 第一个有效点
    result[period - 1] = sum / period

    // 滑动计算后续点
    for (let i = period; i < data.length; i++) {
        const prevItem = data[i - period]
        const currItem = data[i]
        if (!prevItem || !currItem) continue

        sum = sum - prevItem.close + currItem.close
        result[i] = sum / period
    }

    return result
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

    // MA 计算缓存
    const maCache: Map<number, MACache> = new Map()
    let cachedData: KLineData[] | null = null

    // 获取或计算 MA 数据
    function getMAData(data: KLineData[], period: number): (number | undefined)[] {
        // 检查缓存是否有效
        const cache = maCache.get(period)
        if (cache && cachedData === data) {
            return cache.values
        }

        // 重新计算
        const values = calcMAData(data, period)
        maCache.set(period, { period, values })
        cachedData = data

        return values
    }

    // 绘制单条 MA 线
    function drawMALine(
        ctx: CanvasRenderingContext2D,
        maData: (number | undefined)[],
        context: RenderContext,
        color: string
    ) {
        const { pane, range, kWidth, dpr, kLinePositions } = context

        ctx.strokeStyle = color
        ctx.lineWidth = 1
        ctx.lineJoin = 'round'
        ctx.lineCap = 'round'
        ctx.beginPath()

        let isFirst = true

        for (let i = range.start; i < range.end && i < maData.length; i++) {
            const maValue = maData[i]
            if (maValue === undefined) continue

            const logicX = kLinePositions[i - range.start]! + kWidth / 2
            const logicY = pane.yAxis.priceToY(maValue)

            const x = alignToPhysicalPixelCenter(logicX, dpr)
            const y = alignToPhysicalPixelCenter(logicY, dpr)

            if (isFirst) {
                ctx.moveTo(x, y)
                isFirst = false
            } else {
                ctx.lineTo(x, y)
            }
        }

        ctx.stroke()
    }

    return {
        name: 'ma',
        version: '1.0.0',
        description: 'MA均线渲染器',
        debugName: 'MA均线',
        paneId: 'main',
        priority: RENDERER_PRIORITY.INDICATOR,

        draw(context: RenderContext) {
            const { ctx, data, scrollLeft } = context
            const klineData = data as KLineData[]
            if (!klineData.length) return

            ctx.save()
            ctx.translate(-scrollLeft, 0)

            // 按需计算并绘制各周期 MA
            if (config.ma5) {
                const ma5 = getMAData(klineData, 5)
                drawMALine(ctx, ma5, context, MA_COLORS.MA5)
            }

            if (config.ma10) {
                const ma10 = getMAData(klineData, 10)
                drawMALine(ctx, ma10, context, MA_COLORS.MA10)
            }

            if (config.ma20) {
                const ma20 = getMAData(klineData, 20)
                drawMALine(ctx, ma20, context, MA_COLORS.MA20)
            }

            if (config.ma30) {
                const ma30 = getMAData(klineData, 30)
                drawMALine(ctx, ma30, context, MA_COLORS.MA30)
            }

            if (config.ma60) {
                const ma60 = getMAData(klineData, 60)
                drawMALine(ctx, ma60, context, MA_COLORS.MA60)
            }

            ctx.restore()
        },

        onDataUpdate() {
            // 数据更新时清除缓存
            cachedData = null
            maCache.clear()
        },

        getConfig() {
            return { ...config }
        },

        setConfig(newConfig: Record<string, unknown>) {
            Object.assign(config, newConfig)
        },
    }
}
