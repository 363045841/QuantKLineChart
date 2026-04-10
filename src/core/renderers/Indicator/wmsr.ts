import type { RendererPlugin, RenderContext } from '@/plugin'
import { RENDERER_PRIORITY } from '@/plugin'
import type { KLineData } from '@/types/price'
import { WMSR_COLORS } from '@/core/theme/colors'
import { alignToPhysicalPixelCenter } from '@/core/draw/pixelAlign'

export interface WMSRConfig {
    /** 周期（默认 14） */
    period?: number
    /** 是否显示 WMSR 线 */
    showWMSR?: boolean
}

/**
 * 计算 WMSR 数据
 * %R = (H_n - C) / (H_n - L_n) * 100
 * 注意：WMSR 的值范围是 -100 到 0
 */
function calcWMSRData(data: KLineData[], period: number): (number | undefined)[] {
    const result: (number | undefined)[] = new Array(data.length)

    if (data.length < period) return result

    for (let i = period - 1; i < data.length; i++) {
        let highest = -Infinity
        let lowest = Infinity

        for (let j = 0; j < period; j++) {
            const item = data[i - j]
            if (!item) continue
            highest = Math.max(highest, item.high)
            lowest = Math.min(lowest, item.low)
        }

        const close = data[i]!.close
        if (highest === lowest) {
            result[i] = -50 // 避免除零
        } else {
            result[i] = ((highest - close) / (highest - lowest)) * -100
        }
    }

    return result
}

/**
 * 创建 WMSR 渲染器插件
 */
export function createWMSRRendererPlugin(initialConfig: WMSRConfig = {}): RendererPlugin {
    const config: Required<WMSRConfig> = {
        period: 14,
        showWMSR: true,
        ...initialConfig,
    }

    // 缓存计算结果
    let cachedData: KLineData[] | null = null
    let cachedPeriod = 0
    let wmsrValues: (number | undefined)[] = []

    function getWMSRData(data: KLineData[]) {
        if (cachedData !== data || cachedPeriod !== config.period) {
            wmsrValues = calcWMSRData(data, config.period)
            cachedData = data
            cachedPeriod = config.period
        }
        return wmsrValues
    }

    return {
        name: 'wmsr',
        version: '1.0.0',
        description: 'WMSR 威廉指标渲染器',
        debugName: 'WMSR',
        paneId: 'sub',
        priority: RENDERER_PRIORITY.MAIN,

        draw(context: RenderContext) {
            const { ctx, pane, data, range, scrollLeft, kWidth, dpr, kLinePositions } = context
            const klineData = data as KLineData[]
            if (klineData.length < config.period) return

            const wmsrData = getWMSRData(klineData)

            // WMSR 范围固定 -100 到 0
            const valueMin = -100
            const valueMax = 0
            const valueRange = valueMax - valueMin

            ctx.save()
            ctx.translate(-scrollLeft, 0)

            // 绘制超买超卖线 -20 / -80
            const y20 = pane.height - (-20 - valueMin) / valueRange * pane.height
            const y80 = pane.height - (-80 - valueMin) / valueRange * pane.height
            const y50 = pane.height - (-50 - valueMin) / valueRange * pane.height

            const lineStartX = scrollLeft
            const lineEndX = scrollLeft + context.paneWidth

            ctx.strokeStyle = WMSR_COLORS.OVERBOUGHT
            ctx.lineWidth = 1
            ctx.setLineDash([4, 4])
            ctx.beginPath()
            ctx.moveTo(lineStartX, y20)
            ctx.lineTo(lineEndX, y20)
            ctx.stroke()

            ctx.strokeStyle = WMSR_COLORS.OVERSOLD
            ctx.beginPath()
            ctx.moveTo(lineStartX, y80)
            ctx.lineTo(lineEndX, y80)
            ctx.stroke()

            ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)'
            ctx.beginPath()
            ctx.moveTo(lineStartX, y50)
            ctx.lineTo(lineEndX, y50)
            ctx.stroke()
            ctx.setLineDash([])

            // 绘制 WMSR 线
            const drawStart = Math.max(range.start, config.period - 1)
            const drawEnd = Math.min(range.end, klineData.length)

            if (config.showWMSR) {
                ctx.strokeStyle = WMSR_COLORS.WMSR
                ctx.lineWidth = 1
                ctx.lineJoin = 'round'
                ctx.lineCap = 'round'
                ctx.beginPath()
                let isFirst = true

                for (let i = drawStart; i < drawEnd; i++) {
                    const value = wmsrData[i]
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
 * 计算指定索引处的 WMSR 值
 */
export function calcWMSRAtIndex(
    data: KLineData[],
    index: number,
    period: number
): number | undefined {
    const wmsrData = calcWMSRData(data, period)
    return wmsrData[index]
}
