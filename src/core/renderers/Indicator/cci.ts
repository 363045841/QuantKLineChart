import type { RendererPlugin, RenderContext } from '@/plugin'
import { RENDERER_PRIORITY } from '@/plugin'
import type { KLineData } from '@/types/price'
import { CCI_COLORS } from '@/core/theme/colors'
import { alignToPhysicalPixelCenter } from '@/core/draw/pixelAlign'

export interface CCIConfig {
    /** 周期（默认 14） */
    period?: number
    /** 是否显示 CCI 线 */
    showCCI?: boolean
}

/**
 * 计算 CCI 数据
 * CCI = (TP - MA) / (0.015 * MD)
 * TP = (High + Low + Close) / 3
 */
function calcCCIData(data: KLineData[], period: number): (number | undefined)[] {
    const result: (number | undefined)[] = new Array(data.length)

    if (data.length < period) return result

    // 计算 TP
    const tp: number[] = data.map(d => (d!.high + d!.low + d!.close) / 3)

    for (let i = period - 1; i < data.length; i++) {
        // 计算 MA
        let sum = 0
        for (let j = 0; j < period; j++) {
            sum += tp[i - j]!
        }
        const ma = sum / period

        // 计算 MD (平均绝对偏差)
        let mdSum = 0
        for (let j = 0; j < period; j++) {
            mdSum += Math.abs(tp[i - j]! - ma)
        }
        const md = mdSum / period

        if (md === 0) {
            result[i] = 0
        } else {
            result[i] = (tp[i]! - ma) / (0.015 * md)
        }
    }

    return result
}

/**
 * 创建 CCI 渲染器插件
 */
export function createCCIRendererPlugin(initialConfig: CCIConfig = {}): RendererPlugin {
    const config: Required<CCIConfig> = {
        period: 14,
        showCCI: true,
        ...initialConfig,
    }

    // 缓存计算结果
    let cachedData: KLineData[] | null = null
    let cachedPeriod = 0
    let cciValues: (number | undefined)[] = []

    function getCCIData(data: KLineData[]) {
        if (cachedData !== data || cachedPeriod !== config.period) {
            cciValues = calcCCIData(data, config.period)
            cachedData = data
            cachedPeriod = config.period
        }
        return cciValues
    }

    return {
        name: 'cci',
        version: '1.0.0',
        description: 'CCI 顺势指标渲染器',
        debugName: 'CCI',
        paneId: 'sub',
        priority: RENDERER_PRIORITY.MAIN,

        draw(context: RenderContext) {
            const { ctx, pane, data, range, scrollLeft, kWidth, dpr, kLinePositions } = context
            const klineData = data as KLineData[]
            if (klineData.length < config.period) return

            const cciData = getCCIData(klineData)

            // 计算可见范围内的最大最小值
            let maxVal = -Infinity
            let minVal = Infinity
            for (let i = range.start; i < range.end && i < cciData.length; i++) {
                const val = cciData[i]
                if (val !== undefined) {
                    maxVal = Math.max(maxVal, val)
                    minVal = Math.min(minVal, val)
                }
            }

            if (!Number.isFinite(maxVal) || !Number.isFinite(minVal)) return

            // 限制范围，至少包含 -100 到 +100
            maxVal = Math.max(maxVal, 150)
            minVal = Math.min(minVal, -150)

            const valueRange = maxVal - minVal || 1

            // 零轴位置
            const zeroY = pane.height - (0 - minVal) / valueRange * pane.height

            ctx.save()
            ctx.translate(-scrollLeft, 0)

            // 绘制超买超卖线 +100/-100
            const y100 = pane.height - (100 - minVal) / valueRange * pane.height
            const yNeg100 = pane.height - (-100 - minVal) / valueRange * pane.height

            const lineStartX = scrollLeft
            const lineEndX = scrollLeft + context.paneWidth

            ctx.strokeStyle = CCI_COLORS.OVERBOUGHT
            ctx.lineWidth = 1
            ctx.setLineDash([4, 4])
            ctx.beginPath()
            ctx.moveTo(lineStartX, y100)
            ctx.lineTo(lineEndX, y100)
            ctx.stroke()

            ctx.strokeStyle = CCI_COLORS.OVERSOLD
            ctx.beginPath()
            ctx.moveTo(lineStartX, yNeg100)
            ctx.lineTo(lineEndX, yNeg100)
            ctx.stroke()

            // 零轴
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)'
            ctx.beginPath()
            ctx.moveTo(lineStartX, zeroY)
            ctx.lineTo(lineEndX, zeroY)
            ctx.stroke()
            ctx.setLineDash([])

            // 绘制 CCI 线
            const drawStart = Math.max(range.start, config.period - 1)
            const drawEnd = Math.min(range.end, klineData.length)

            if (config.showCCI) {
                ctx.strokeStyle = CCI_COLORS.CCI
                ctx.lineWidth = 1
                ctx.lineJoin = 'round'
                ctx.lineCap = 'round'
                ctx.beginPath()
                let isFirst = true

                for (let i = drawStart; i < drawEnd; i++) {
                    const value = cciData[i]
                    if (value === undefined) continue

                    const x = kLinePositions[i - range.start]
                    if (x === undefined) continue

                    const logicX = x + kWidth / 2
                    const logicY = pane.height - (value - minVal) / valueRange * pane.height

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
            if ('period' in newConfig && newConfig.period !== config.period) cachedData = null
            Object.assign(config, newConfig)
        },
    }
}

/**
 * 计算指定索引处的 CCI 值
 */
export function calcCCIAtIndex(
    data: KLineData[],
    index: number,
    period: number
): number | undefined {
    const cciData = calcCCIData(data, period)
    return cciData[index]
}
