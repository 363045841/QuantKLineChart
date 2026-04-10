import type { RendererPlugin, RenderContext } from '@/plugin'
import { RENDERER_PRIORITY } from '@/plugin'
import type { KLineData } from '@/types/price'
import { RSI_COLORS } from '@/core/theme/colors'
import { alignToPhysicalPixelCenter } from '@/core/draw/pixelAlign'

export interface RSIConfig {
    /** 第一条 RSI 周期（默认 6） */
    period1?: number
    /** 第二条 RSI 周期（默认 12） */
    period2?: number
    /** 第三条 RSI 周期（默认 24） */
    period3?: number
    /** 是否显示 RSI1 */
    showRSI1?: boolean
    /** 是否显示 RSI2 */
    showRSI2?: boolean
    /** 是否显示 RSI3 */
    showRSI3?: boolean
}

/**
 * 计算 RSI 数据
 * RSI = 100 - 100 / (1 + RS)
 * RS = 平均上涨幅度 / 平均下跌幅度
 */
function calcRSIData(data: KLineData[], period: number): (number | undefined)[] {
    const result: (number | undefined)[] = new Array(data.length)

    if (data.length < period + 1) return result

    // 计算价格变化
    const changes: number[] = []
    for (let i = 1; i < data.length; i++) {
        changes.push(data[i]!.close - data[i - 1]!.close)
    }

    // 初始化：计算前 period 天的平均涨跌
    let sumGain = 0
    let sumLoss = 0

    for (let i = 0; i < period; i++) {
        const change = changes[i]
        if (change !== undefined) {
            if (change > 0) sumGain += change
            else sumLoss += Math.abs(change)
        }
    }

    // 第一个 RSI 值
    let avgGain = sumGain / period
    let avgLoss = sumLoss / period

    if (avgLoss === 0) {
        result[period] = 100
    } else {
        const rs = avgGain / avgLoss
        result[period] = 100 - 100 / (1 + rs)
    }

    // 后续使用平滑计算
    for (let i = period; i < changes.length; i++) {
        const change = changes[i]
        if (change === undefined) continue

        if (change > 0) {
            avgGain = (avgGain * (period - 1) + change) / period
            avgLoss = (avgLoss * (period - 1)) / period
        } else {
            avgGain = (avgGain * (period - 1)) / period
            avgLoss = (avgLoss * (period - 1) + Math.abs(change)) / period
        }

        if (avgLoss === 0) {
            result[i + 1] = 100
        } else {
            const rs = avgGain / avgLoss
            result[i + 1] = 100 - 100 / (1 + rs)
        }
    }

    return result
}

/**
 * 创建 RSI 渲染器插件
 */
export function createRSIRendererPlugin(initialConfig: RSIConfig = {}): RendererPlugin {
    const config: Required<RSIConfig> = {
        period1: 6,
        period2: 12,
        period3: 24,
        showRSI1: true,
        showRSI2: true,
        showRSI3: true,
        ...initialConfig,
    }

    // 缓存计算结果
    let cachedData: KLineData[] | null = null
    let cachedPeriod1 = 0
    let cachedPeriod2 = 0
    let cachedPeriod3 = 0
    let rsi1: (number | undefined)[] = []
    let rsi2: (number | undefined)[] = []
    let rsi3: (number | undefined)[] = []

    function getRSIData(data: KLineData[]) {
        if (
            cachedData !== data ||
            cachedPeriod1 !== config.period1 ||
            cachedPeriod2 !== config.period2 ||
            cachedPeriod3 !== config.period3
        ) {
            rsi1 = calcRSIData(data, config.period1)
            rsi2 = calcRSIData(data, config.period2)
            rsi3 = calcRSIData(data, config.period3)
            cachedData = data
            cachedPeriod1 = config.period1
            cachedPeriod2 = config.period2
            cachedPeriod3 = config.period3
        }
        return { rsi1, rsi2, rsi3 }
    }

    return {
        name: 'rsi',
        version: '1.0.0',
        description: 'RSI 相对强弱指标渲染器',
        debugName: 'RSI',
        paneId: 'sub',
        priority: RENDERER_PRIORITY.MAIN,

        draw(context: RenderContext) {
            const { ctx, pane, data, range, scrollLeft, kWidth, dpr, kLinePositions } = context
            const klineData = data as KLineData[]
            if (klineData.length < config.period1 + 1) return

            const { rsi1, rsi2, rsi3 } = getRSIData(klineData)

            // RSI 范围固定 0-100
            const valueMin = 0
            const valueMax = 100
            const valueRange = valueMax - valueMin

            ctx.save()
            ctx.translate(-scrollLeft, 0)

            // 绘制超买超卖线
            const y80 = pane.height - (80 - valueMin) / valueRange * pane.height
            const y50 = pane.height - (50 - valueMin) / valueRange * pane.height
            const y20 = pane.height - (20 - valueMin) / valueRange * pane.height

            const lineStartX = scrollLeft
            const lineEndX = scrollLeft + context.paneWidth

            ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)'
            ctx.lineWidth = 1
            ctx.setLineDash([4, 4])
            ctx.beginPath()
            ctx.moveTo(lineStartX, y80)
            ctx.lineTo(lineEndX, y80)
            ctx.moveTo(lineStartX, y50)
            ctx.lineTo(lineEndX, y50)
            ctx.moveTo(lineStartX, y20)
            ctx.lineTo(lineEndX, y20)
            ctx.stroke()
            ctx.setLineDash([])

            const drawStart = Math.max(range.start, config.period1)
            const drawEnd = Math.min(range.end, klineData.length)

            const drawLine = (data: (number | undefined)[], color: string) => {
                ctx.strokeStyle = color
                ctx.lineWidth = 1
                ctx.lineJoin = 'round'
                ctx.lineCap = 'round'
                ctx.beginPath()
                let isFirst = true

                for (let i = drawStart; i < drawEnd; i++) {
                    const value = data[i]
                    if (value === undefined) continue

                    const x = kLinePositions[i - range.start]
                    if (x === undefined) continue

                    const logicX = x + kWidth / 2
                    const logicY = pane.height - (value - valueMin) / valueRange * pane.height

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

            if (config.showRSI1) drawLine(rsi1, RSI_COLORS.RSI1)
            if (config.showRSI2) drawLine(rsi2, RSI_COLORS.RSI2)
            if (config.showRSI3) drawLine(rsi3, RSI_COLORS.RSI3)

            ctx.restore()
        },

        onDataUpdate() {
            cachedData = null
        },

        getConfig() {
            return { ...config }
        },

        setConfig(newConfig: Record<string, unknown>) {
            if ('period1' in newConfig && newConfig.period1 !== config.period1) cachedData = null
            if ('period2' in newConfig && newConfig.period2 !== config.period2) cachedData = null
            if ('period3' in newConfig && newConfig.period3 !== config.period3) cachedData = null
            Object.assign(config, newConfig)
        },
    }
}

/**
 * 计算指定索引处的 RSI 值
 */
export function calcRSIAtIndex(
    data: KLineData[],
    index: number,
    period: number
): number | undefined {
    const rsiData = calcRSIData(data, period)
    return rsiData[index]
}

/**
 * 获取 RSI 标题信息（供 paneTitle 使用）
 */
export function getRSITitleInfo(
    data: KLineData[],
    index: number,
    period1: number = 6,
    period2: number = 12,
    period3: number = 24
): { name: string; params: number[]; values: Array<{ label: string; value: number; color: string }> } | null {
    if (index < period1 + 1 || index >= data.length) return null

    const rsi1 = calcRSIData(data, period1)[index]
    const rsi2 = calcRSIData(data, period2)[index]
    const rsi3 = calcRSIData(data, period3)[index]

    const values: Array<{ label: string; value: number; color: string }> = []
    if (rsi1 !== undefined) values.push({ label: `RSI${period1}`, value: rsi1, color: RSI_COLORS.RSI1 })
    if (rsi2 !== undefined) values.push({ label: `RSI${period2}`, value: rsi2, color: RSI_COLORS.RSI2 })
    if (rsi3 !== undefined) values.push({ label: `RSI${period3}`, value: rsi3, color: RSI_COLORS.RSI3 })

    if (values.length === 0) return null

    return {
        name: 'RSI',
        params: [period1, period2, period3],
        values,
    }
}
