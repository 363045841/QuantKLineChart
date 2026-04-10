import type { RendererPlugin, RenderContext } from '@/plugin'
import { RENDERER_PRIORITY } from '@/plugin'
import type { KLineData } from '@/types/price'
import { MACD_COLORS } from '@/core/theme/colors'
import { alignToPhysicalPixelCenter } from '@/core/draw/pixelAlign'

export interface MACDConfig {
    /** 快线周期（默认 12） */
    fastPeriod?: number
    /** 慢线周期（默认 26） */
    slowPeriod?: number
    /** DEA 周期（默认 9） */
    signalPeriod?: number
    /** 是否显示 DIF 线 */
    showDIF?: boolean
    /** 是否显示 DEA 线 */
    showDEA?: boolean
    /** 是否显示 MACD 柱 */
    showBAR?: boolean
}

interface MACDPoint {
    dif: number
    dea: number
    macd: number
}

/**
 * 计算 EMA 值
 * EMA(today) = close × K + EMA(yesterday) × (1 - K)
 * K = 2 / (period + 1)
 */
function calcEMA(data: KLineData[], period: number): number[] {
    const result: number[] = new Array(data.length)
    const k = 2 / (period + 1)

    if (data.length === 0) return result

    // 第一个 EMA 值使用第一个收盘价
    result[0] = data[0]!.close

    for (let i = 1; i < data.length; i++) {
        const item = data[i]
        if (!item) continue
        result[i] = item.close * k + result[i - 1]! * (1 - k)
    }

    return result
}

/**
 * 计算 EMA 数组（基于已有的数值数组）
 */
function calcEMAFromArray(values: (number | undefined)[], period: number): (number | undefined)[] {
    const result: (number | undefined)[] = new Array(values.length)
    const k = 2 / (period + 1)

    const firstValid = values.findIndex(v => v !== undefined)
    if (firstValid === -1) return result

    result[firstValid] = values[firstValid]

    for (let i = firstValid + 1; i < values.length; i++) {
        const val = values[i]
        const prev = result[i - 1]
        if (val === undefined || prev === undefined) continue
        result[i] = val * k + prev * (1 - k)
    }

    return result
}

/**
 * 计算所有 MACD 值
 */
function calcMACDData(
    data: KLineData[],
    fastPeriod: number,
    slowPeriod: number,
    signalPeriod: number
): MACDPoint[] {
    const result: MACDPoint[] = new Array(data.length)

    if (data.length < slowPeriod) return result

    // 计算 EMA12 和 EMA26
    const emaFast = calcEMA(data, fastPeriod)
    const emaSlow = calcEMA(data, slowPeriod)

    // 计算 DIF
    const dif: (number | undefined)[] = new Array(data.length)
    for (let i = 0; i < data.length; i++) {
        const fast = emaFast[i]
        const slow = emaSlow[i]
        if (fast !== undefined && slow !== undefined) {
            dif[i] = fast - slow
        }
    }

    // 计算 DEA（DIF 的 signalPeriod 日 EMA）
    const dea = calcEMAFromArray(dif, signalPeriod)

    // 计算 MACD 柱
    for (let i = 0; i < data.length; i++) {
        const d = dif[i]
        const e = dea[i]
        if (d !== undefined && e !== undefined) {
            result[i] = {
                dif: d,
                dea: e,
                macd: (d - e) * 2,
            }
        }
    }

    return result
}

/**
 * 创建 MACD 渲染器插件
 */
export function createMACDRendererPlugin(initialConfig: MACDConfig = {}): RendererPlugin {
    const config: Required<MACDConfig> = {
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9,
        showDIF: true,
        showDEA: true,
        showBAR: true,
        ...initialConfig,
    }

    // 缓存 MACD 计算结果
    let cachedData: KLineData[] | null = null
    let cachedFastPeriod: number = 0
    let cachedSlowPeriod: number = 0
    let cachedSignalPeriod: number = 0
    let macdPoints: MACDPoint[] = []

    // 获取或更新缓存
    function getMACDPoints(data: KLineData[]): MACDPoint[] {
        if (
            cachedData !== data ||
            cachedFastPeriod !== config.fastPeriod ||
            cachedSlowPeriod !== config.slowPeriod ||
            cachedSignalPeriod !== config.signalPeriod
        ) {
            macdPoints = calcMACDData(data, config.fastPeriod, config.slowPeriod, config.signalPeriod)
            cachedData = data
            cachedFastPeriod = config.fastPeriod
            cachedSlowPeriod = config.slowPeriod
            cachedSignalPeriod = config.signalPeriod
        }
        return macdPoints
    }

    return {
        name: 'macd',
        version: '1.0.0',
        description: 'MACD 指标渲染器',
        debugName: 'MACD',
        paneId: 'sub',
        priority: RENDERER_PRIORITY.MAIN,

        draw(context: RenderContext) {
            const { ctx, pane, data, range, scrollLeft, kWidth, kGap, dpr, kLinePositions } = context
            const klineData = data as KLineData[]
            if (klineData.length < config.slowPeriod) return

            const macdData = getMACDPoints(klineData)

            // 计算可见范围内的最大最小值
            let maxVal = -Infinity
            let minVal = Infinity
            for (let i = range.start; i < range.end && i < macdData.length; i++) {
                const point = macdData[i]
                if (!point) continue
                maxVal = Math.max(maxVal, point.dif, point.dea, point.macd)
                minVal = Math.min(minVal, point.dif, point.dea, point.macd)
            }

            if (!Number.isFinite(maxVal) || !Number.isFinite(minVal)) return

            // 计算数值范围，添加上下留白
            const padding = Math.max(0.05, (maxVal - minVal) * 0.1)
            const valueMin = minVal - padding
            const valueMax = maxVal + padding
            const valueRange = valueMax - valueMin || 1

            // 零轴位置
            const zeroY = pane.height - (0 - valueMin) / valueRange * pane.height

            ctx.save()
            ctx.translate(-scrollLeft, 0)

            const drawStart = Math.max(range.start, config.slowPeriod - 1)
            const drawEnd = Math.min(range.end, klineData.length)

            // 绘制 MACD 柱状图
            if (config.showBAR) {
                const barWidth = Math.max(1, kWidth - 2)
                for (let i = drawStart; i < drawEnd; i++) {
                    const point = macdData[i]
                    if (!point) continue

                    const x = kLinePositions[i - range.start]
                    if (x === undefined) continue

                    const barY = pane.height - (point.macd - valueMin) / valueRange * pane.height
                    const isUp = point.macd >= 0
                    ctx.fillStyle = isUp ? MACD_COLORS.BAR_UP : MACD_COLORS.BAR_DOWN

                    if (isUp) {
                        ctx.fillRect(x, barY, barWidth, zeroY - barY)
                    } else {
                        ctx.fillRect(x, zeroY, barWidth, barY - zeroY)
                    }
                }
            }

            // 绘制 DIF 线
            if (config.showDIF) {
                ctx.strokeStyle = MACD_COLORS.DIF
                ctx.lineWidth = 1
                ctx.lineJoin = 'round'
                ctx.lineCap = 'round'
                ctx.beginPath()
                let isFirst = true

                for (let i = drawStart; i < drawEnd; i++) {
                    const point = macdData[i]
                    if (!point) continue

                    const x = kLinePositions[i - range.start]
                    if (x === undefined) continue

                    const logicX = x + kWidth / 2
                    const logicY = pane.height - (point.dif - valueMin) / valueRange * pane.height

                    const px = alignToPhysicalPixelCenter(logicX, dpr)
                    const py = alignToPhysicalPixelCenter(logicY, dpr)

                    if (isFirst) {
                        ctx.moveTo(px, py)
                        isFirst = false
                    } else {
                        ctx.lineTo(px, py)
                    }
                }
                ctx.stroke()
            }

            // 绘制 DEA 线
            if (config.showDEA) {
                ctx.strokeStyle = MACD_COLORS.DEA
                ctx.lineWidth = 1
                ctx.lineJoin = 'round'
                ctx.lineCap = 'round'
                ctx.beginPath()
                let isFirst = true

                for (let i = drawStart; i < drawEnd; i++) {
                    const point = macdData[i]
                    if (!point) continue

                    const x = kLinePositions[i - range.start]
                    if (x === undefined) continue

                    const logicX = x + kWidth / 2
                    const logicY = pane.height - (point.dea - valueMin) / valueRange * pane.height

                    const px = alignToPhysicalPixelCenter(logicX, dpr)
                    const py = alignToPhysicalPixelCenter(logicY, dpr)

                    if (isFirst) {
                        ctx.moveTo(px, py)
                        isFirst = false
                    } else {
                        ctx.lineTo(px, py)
                    }
                }
                ctx.stroke()
            }

            ctx.restore()
        },

        onDataUpdate() {
            cachedData = null
        },

        getConfig() {
            return { ...config }
        },

        setConfig(newConfig: Record<string, unknown>) {
            if ('fastPeriod' in newConfig && newConfig.fastPeriod !== config.fastPeriod) {
                cachedData = null
            }
            if ('slowPeriod' in newConfig && newConfig.slowPeriod !== config.slowPeriod) {
                cachedData = null
            }
            if ('signalPeriod' in newConfig && newConfig.signalPeriod !== config.signalPeriod) {
                cachedData = null
            }
            Object.assign(config, newConfig)
        },
    }
}

/**
 * 计算指定索引处的 MACD 值（供图例使用）
 */
export function calcMACDAtIndex(
    data: KLineData[],
    index: number,
    fastPeriod: number = 12,
    slowPeriod: number = 26,
    signalPeriod: number = 9
): { dif: number; dea: number; macd: number } | null {
    if (index < slowPeriod || index >= data.length) return null

    const macdData = calcMACDData(data, fastPeriod, slowPeriod, signalPeriod)
    return macdData[index] ?? null
}
