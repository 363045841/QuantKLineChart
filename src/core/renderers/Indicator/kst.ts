import type { RendererPlugin, RenderContext } from '@/plugin'
import { RENDERER_PRIORITY } from '@/plugin'
import type { KLineData } from '@/types/price'
import { KST_COLORS } from '@/core/theme/colors'
import { alignToPhysicalPixelCenter } from '@/core/draw/pixelAlign'

export interface KSTConfig {
    /** ROC1 周期（默认 10） */
    roc1?: number
    /** ROC2 周期（默认 15） */
    roc2?: number
    /** ROC3 周期（默认 20） */
    roc3?: number
    /** ROC4 周期（默认 30） */
    roc4?: number
    /** 信号线周期（默认 9） */
    signalPeriod?: number
    /** 是否显示 KST 线 */
    showKST?: boolean
    /** 是否显示信号线 */
    showSignal?: boolean
}

interface KSTPoint {
    kst: number
    signal: number
}

/**
 * 计算 ROC (Rate of Change)
 * ROC = (C - C_n) / C_n * 100
 */
function calcROC(data: KLineData[], period: number): (number | undefined)[] {
    const result: (number | undefined)[] = new Array(data.length)

    if (data.length < period + 1) return result

    for (let i = period; i < data.length; i++) {
        const currentClose = data[i]?.close
        const prevClose = data[i - period]?.close

        if (currentClose !== undefined && prevClose !== undefined && prevClose !== 0) {
            result[i] = ((currentClose - prevClose) / prevClose) * 100
        }
    }

    return result
}

/**
 * 计算 SMA
 */
function calcSMA(data: (number | undefined)[], period: number): (number | undefined)[] {
    const result: (number | undefined)[] = new Array(data.length)

    let sum = 0
    let count = 0

    for (let i = 0; i < data.length; i++) {
        const val = data[i]

        if (val !== undefined) {
            sum += val
            count++

            if (count > period) {
                const oldVal = data[i - period]
                if (oldVal !== undefined) {
                    sum -= oldVal
                    count--
                }
            }

            if (count === period) {
                result[i] = sum / period
            }
        }
    }

    return result
}

/**
 * 计算 KST 数据
 */
function calcKSTData(
    data: KLineData[],
    roc1: number,
    roc2: number,
    roc3: number,
    roc4: number,
    signalPeriod: number
): KSTPoint[] {
    const result: KSTPoint[] = new Array(data.length)

    // 计算各周期的 ROC
    const roc1Data = calcROC(data, roc1)
    const roc2Data = calcROC(data, roc2)
    const roc3Data = calcROC(data, roc3)
    const roc4Data = calcROC(data, roc4)

    // 计算各 ROC 的 SMA
    const sma1 = calcSMA(roc1Data, 10)
    const sma2 = calcSMA(roc2Data, 10)
    const sma3 = calcSMA(roc3Data, 10)
    const sma4 = calcSMA(roc4Data, 15)

    // 计算 KST = SMA1*1 + SMA2*2 + SMA3*3 + SMA4*4
    const kstValues: (number | undefined)[] = new Array(data.length)

    for (let i = 0; i < data.length; i++) {
        const v1 = sma1[i]
        const v2 = sma2[i]
        const v3 = sma3[i]
        const v4 = sma4[i]

        if (v1 !== undefined && v2 !== undefined && v3 !== undefined && v4 !== undefined) {
            kstValues[i] = v1 * 1 + v2 * 2 + v3 * 3 + v4 * 4
        }
    }

    // 计算信号线
    const signalData = calcSMA(kstValues, signalPeriod)

    for (let i = 0; i < data.length; i++) {
        const kst = kstValues[i]
        const signal = signalData[i]

        if (kst !== undefined && signal !== undefined) {
            result[i] = { kst, signal }
        }
    }

    return result
}

/**
 * 创建 KST 渲染器插件
 */
export function createKSTRendererPlugin(initialConfig: KSTConfig = {}): RendererPlugin {
    const config: Required<KSTConfig> = {
        roc1: 10,
        roc2: 15,
        roc3: 20,
        roc4: 30,
        signalPeriod: 9,
        showKST: true,
        showSignal: true,
        ...initialConfig,
    }

    // 缓存计算结果
    let cachedData: KLineData[] | null = null
    let cachedConfig = ''
    let kstPoints: KSTPoint[] = []

    function getKSTData(data: KLineData[]) {
        const configKey = `${config.roc1}-${config.roc2}-${config.roc3}-${config.roc4}-${config.signalPeriod}`
        if (cachedData !== data || cachedConfig !== configKey) {
            kstPoints = calcKSTData(
                data,
                config.roc1,
                config.roc2,
                config.roc3,
                config.roc4,
                config.signalPeriod
            )
            cachedData = data
            cachedConfig = configKey
        }
        return kstPoints
    }

    return {
        name: 'kst',
        version: '1.0.0',
        description: 'KST 确知指标渲染器',
        debugName: 'KST',
        paneId: 'sub',
        priority: RENDERER_PRIORITY.MAIN,

        draw(context: RenderContext) {
            const { ctx, pane, data, range, scrollLeft, kWidth, dpr, kLinePositions } = context
            const klineData = data as KLineData[]
            if (klineData.length < config.roc4 + 15 + config.signalPeriod) return

            const kstData = getKSTData(klineData)

            // 计算可见范围内的最大最小值
            let maxVal = -Infinity
            let minVal = Infinity
            for (let i = range.start; i < range.end && i < kstData.length; i++) {
                const point = kstData[i]
                if (point) {
                    maxVal = Math.max(maxVal, point.kst, point.signal)
                    minVal = Math.min(minVal, point.kst, point.signal)
                }
            }

            if (!Number.isFinite(maxVal) || !Number.isFinite(minVal)) return

            // 添加上下留白
            const padding = (maxVal - minVal) * 0.1 || 1
            maxVal += padding
            minVal -= padding

            const valueRange = maxVal - minVal || 1
            const zeroY = pane.height - (0 - minVal) / valueRange * pane.height

            ctx.save()
            ctx.translate(-scrollLeft, 0)

            // 绘制零轴
            const lineStartX = scrollLeft
            const lineEndX = scrollLeft + context.paneWidth

            ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)'
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.moveTo(lineStartX, zeroY)
            ctx.lineTo(lineEndX, zeroY)
            ctx.stroke()

            const drawStart = Math.max(range.start, config.roc4 + 15 + config.signalPeriod - 1)
            const drawEnd = Math.min(range.end, klineData.length)

            // 绘制 KST 线
            if (config.showKST) {
                ctx.strokeStyle = KST_COLORS.KST
                ctx.lineWidth = 1
                ctx.lineJoin = 'round'
                ctx.lineCap = 'round'
                ctx.beginPath()
                let isFirst = true

                for (let i = drawStart; i < drawEnd; i++) {
                    const point = kstData[i]
                    if (!point) continue

                    const x = kLinePositions[i - range.start]
                    if (x === undefined) continue

                    const logicX = x + kWidth / 2
                    const logicY = pane.height - (point.kst - minVal) / valueRange * pane.height

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

            // 绘制信号线
            if (config.showSignal) {
                ctx.strokeStyle = KST_COLORS.SIGNAL
                ctx.lineWidth = 1
                ctx.lineJoin = 'round'
                ctx.lineCap = 'round'
                ctx.beginPath()
                let isFirst = true

                for (let i = drawStart; i < drawEnd; i++) {
                    const point = kstData[i]
                    if (!point) continue

                    const x = kLinePositions[i - range.start]
                    if (x === undefined) continue

                    const logicX = x + kWidth / 2
                    const logicY = pane.height - (point.signal - minVal) / valueRange * pane.height

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
            cachedData = null // 配置变化时重新计算
            Object.assign(config, newConfig)
        },
    }
}

/**
 * 计算指定索引处的 KST 值
 */
export function calcKSTAtIndex(
    data: KLineData[],
    index: number,
    roc1: number,
    roc2: number,
    roc3: number,
    roc4: number,
    signalPeriod: number
): KSTPoint | undefined {
    const kstData = calcKSTData(data, roc1, roc2, roc3, roc4, signalPeriod)
    return kstData[index]
}

/**
 * 获取 KST 标题信息（供 paneTitle 使用）
 */
export function getKSTTitleInfo(
    data: KLineData[],
    index: number,
    roc1: number = 10,
    roc2: number = 15,
    roc3: number = 20,
    roc4: number = 30,
    signalPeriod: number = 9
): { name: string; params: number[]; values: Array<{ label: string; value: number; color: string }> } | null {
    const minIndex = roc4 + 15 + signalPeriod
    if (index < minIndex || index >= data.length) return null

    const kstValue = calcKSTAtIndex(data, index, roc1, roc2, roc3, roc4, signalPeriod)
    if (!kstValue) return null

    return {
        name: 'KST',
        params: [roc1, roc2, roc3, roc4, signalPeriod],
        values: [
            { label: 'KST', value: kstValue.kst, color: KST_COLORS.KST },
            { label: 'Signal', value: kstValue.signal, color: KST_COLORS.SIGNAL },
        ],
    }
}
