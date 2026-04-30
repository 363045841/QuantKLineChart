import type { RendererPlugin, RenderContext } from '@/plugin'
import { RENDERER_PRIORITY } from '@/plugin'
import type { KLineData } from '@/types/price'
import type { drawOption } from '@/utils/kLineDraw/kLine'
import { alignToPhysicalPixelCenter } from '@/core/draw/pixelAlign'
import { BOLL_COLORS } from '@/core/theme/colors'

export interface BOLLConfig {
    /** 周期（默认20） */
    period?: number
    /** 标准差倍数（默认2） */
    multiplier?: number
    /** 是否显示上轨 */
    showUpper?: boolean
    /** 是否显示下轨 */
    showMiddle?: boolean
    /** 是否显示下轨 */
    showLower?: boolean
    /** 是否填充带状区域 */
    showBand?: boolean
}

interface BOLLPoint {
    upper: number
    middle: number
    lower: number
}

/**
 * 计算所有 BOLL 值（使用增量算法优化性能）
 */
function calcBOLLData(
    data: KLineData[],
    period: number,
    multiplier: number
): BOLLPoint[] {
    const result: BOLLPoint[] = new Array(data.length)

    if (data.length < period) return result

    // 使用滑动窗口计算，避免重复求和
    let sum = 0
    const window: number[] = []

    // 初始化第一个窗口
    for (let i = 0; i < period; i++) {
        const item = data[i]
        if (!item) return result
        const close = item.close
        window.push(close)
        sum += close
    }

    // 计算每个点的 BOLL
    for (let i = period - 1; i < data.length; i++) {
        const item = data[i]
        if (!item) continue

        // 更新窗口求和
        if (i >= period) {
            const oldVal = window.shift()
            if (oldVal !== undefined) sum -= oldVal
            const close = item.close
            window.push(close)
            sum += close
        }

        const ma = sum / period

        // 计算标准差
        let variance = 0
        for (let j = 0; j < period; j++) {
            const wVal = window[j]
            if (wVal !== undefined) {
                variance += Math.pow(wVal - ma, 2)
            }
        }
        const stdDev = Math.sqrt(variance / period)

        result[i] = {
            upper: ma + multiplier * stdDev,
            middle: ma,
            lower: ma - multiplier * stdDev,
        }
    }

    return result
}

/**
 * 创建 BOLL（布林带）渲染器插件
 */
export function createBOLLRendererPlugin(initialConfig: BOLLConfig = {}): RendererPlugin {
    const config: Required<BOLLConfig> = {
        period: 20,
        multiplier: 2,
        showUpper: true,
        showMiddle: true,
        showLower: true,
        showBand: true,
        ...initialConfig,
    }

    // 缓存 BOLL 计算结果
    let cachedData: KLineData[] | null = null
    let cachedPeriod: number = 0
    let cachedMultiplier: number = 0
    let bollPoints: BOLLPoint[] = []

    // 获取或更新缓存
    function getBollPoints(data: KLineData[]): BOLLPoint[] {
        // 检查是否需要重新计算
        if (
            cachedData !== data ||
            cachedPeriod !== config.period ||
            cachedMultiplier !== config.multiplier
        ) {
            bollPoints = calcBOLLData(data, config.period, config.multiplier)
            cachedData = data
            cachedPeriod = config.period
            cachedMultiplier = config.multiplier
        }
        return bollPoints
    }

    return {
        name: 'boll',
        version: '1.0.0',
        description: '布林带渲染器',
        debugName: 'BOLL布林带',
        paneId: 'main',
        priority: RENDERER_PRIORITY.INDICATOR,

        draw(context: RenderContext) {
            const { ctx, pane, data, range, scrollLeft, kWidth, dpr, kLinePositions } = context
            const klineData = data as KLineData[]
            if (klineData.length < config.period) return

            const bollData = getBollPoints(klineData)

            ctx.save()
            ctx.translate(-scrollLeft, 0)

            const drawStart = Math.max(range.start, config.period - 1)
            const drawEnd = Math.min(range.end, klineData.length)

            // 先绘制带状区域
            if (config.showBand) {
                ctx.fillStyle = BOLL_COLORS.BAND_FILL
                ctx.beginPath()
                let isFirst = true

                // 上轨
                for (let i = drawStart; i < drawEnd; i++) {
                    const boll = bollData[i]
                    if (!boll) continue

                    const logicX = kLinePositions[i - range.start]! + kWidth / 2
                    const logicY = pane.yAxis.priceToY(boll.upper)
                    const x = alignToPhysicalPixelCenter(logicX, dpr)
                    const y = alignToPhysicalPixelCenter(logicY, dpr)

                    if (isFirst) {
                        ctx.moveTo(x, y)
                        isFirst = false
                    } else {
                        ctx.lineTo(x, y)
                    }
                }

                // 下轨（反向）
                for (let i = drawEnd - 1; i >= drawStart; i--) {
                    const boll = bollData[i]
                    if (!boll) continue

                    const logicX = kLinePositions[i - range.start]! + kWidth / 2
                    const logicY = pane.yAxis.priceToY(boll.lower)
                    const x = alignToPhysicalPixelCenter(logicX, dpr)
                    const y = alignToPhysicalPixelCenter(logicY, dpr)

                    ctx.lineTo(x, y)
                }

                ctx.closePath()
                ctx.fill()
            }

            // 绘制线条
            ctx.lineWidth = 1
            ctx.lineJoin = 'round'
            ctx.lineCap = 'round'

            const drawLine = (type: 'upper' | 'middle' | 'lower', color: string) => {
                ctx.strokeStyle = color
                ctx.beginPath()
                let isFirst = true

                for (let i = drawStart; i < drawEnd; i++) {
                    const boll = bollData[i]
                    if (!boll) continue

                    const logicX = kLinePositions[i - range.start]! + kWidth / 2
                    const logicY = pane.yAxis.priceToY(boll[type])
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

            if (config.showUpper) drawLine('upper', BOLL_COLORS.UPPER)
            if (config.showMiddle) drawLine('middle', BOLL_COLORS.MIDDLE)
            if (config.showLower) drawLine('lower', BOLL_COLORS.LOWER)

            ctx.restore()
        },

        onDataUpdate() {
            // 数据更新时清除缓存，下次 draw 时重新计算
            cachedData = null
        },

        getConfig() {
            return { ...config }
        },

        setConfig(newConfig: Record<string, unknown>) {
            // 如果周期或倍数变化，需要清除缓存
            if ('period' in newConfig && newConfig.period !== config.period) {
                cachedData = null
            }
            if ('multiplier' in newConfig && newConfig.multiplier !== config.multiplier) {
                cachedData = null
            }
            Object.assign(config, newConfig)
        },
    }
}

/**
 * 计算指定索引处的 BOLL 值（供图例使用）
 */
export function calcBOLLAtIndex(
    data: KLineData[],
    index: number,
    period: number = 20,
    multiplier: number = 2
): { upper: number; middle: number; lower: number } | null {
    if (index < period - 1 || index >= data.length) return null

    // 计算 MA
    let sum = 0
    for (let i = 0; i < period; i++) {
        const item = data[index - i]
        if (!item) return null
        sum += item.close
    }
    const ma = sum / period

    // 计算标准差
    let variance = 0
    for (let i = 0; i < period; i++) {
        const item = data[index - i]
        if (!item) return null
        variance += Math.pow(item.close - ma, 2)
    }
    const stdDev = Math.sqrt(variance / period)

    return {
        upper: ma + multiplier * stdDev,
        middle: ma,
        lower: ma - multiplier * stdDev,
    }
}
