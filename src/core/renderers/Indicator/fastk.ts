import type { RendererPlugin, RenderContext } from '@/plugin'
import { RENDERER_PRIORITY } from '@/plugin'
import type { KLineData } from '@/types/price'
import { KDJ_COLORS } from '@/core/theme/colors'
import { alignToPhysicalPixelCenter } from '@/core/draw/pixelAlign'

export interface FASTKConfig {
    /** 周期（默认 9） */
    period?: number
    /** 是否显示 FASTK 线 */
    showFASTK?: boolean
}

/**
 * 计算 FASTK 数据
 * FASTK = (C - L_n) / (H_n - L_n) * 100
 * 快速随机指标，比普通 STOCH 更敏感
 */
function calcFASTKData(data: KLineData[], period: number): (number | undefined)[] {
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
            result[i] = 50 // 避免除零
        } else {
            result[i] = ((close - lowest) / (highest - lowest)) * 100
        }
    }

    return result
}

/**
 * 创建 FASTK 渲染器插件
 */
export function createFASTKRendererPlugin(initialConfig: FASTKConfig = {}): RendererPlugin {
    const config: Required<FASTKConfig> = {
        period: 9,
        showFASTK: true,
        ...initialConfig,
    }

    // 缓存计算结果
    let cachedData: KLineData[] | null = null
    let cachedPeriod = 0
    let fastkValues: (number | undefined)[] = []

    function getFASTKData(data: KLineData[]) {
        if (cachedData !== data || cachedPeriod !== config.period) {
            fastkValues = calcFASTKData(data, config.period)
            cachedData = data
            cachedPeriod = config.period
        }
        return fastkValues
    }

    return {
        name: 'fastk',
        version: '1.0.0',
        description: 'FASTK 快速随机指标渲染器',
        debugName: 'FASTK',
        paneId: 'sub',
        priority: RENDERER_PRIORITY.MAIN,

        draw(context: RenderContext) {
            const { ctx, pane, data, range, scrollLeft, kWidth, dpr, kLinePositions } = context
            const klineData = data as KLineData[]
            if (klineData.length < config.period) return

            const fastkData = getFASTKData(klineData)

            // 固定范围 0-100
            const valueMin = 0
            const valueMax = 100
            const valueRange = valueMax - valueMin

            ctx.save()
            ctx.translate(-scrollLeft, 0)

            // 绘制超买超卖线
            const y80 = pane.height - (80 - valueMin) / valueRange * pane.height
            const y20 = pane.height - (20 - valueMin) / valueRange * pane.height

            const lineStartX = scrollLeft
            const lineEndX = scrollLeft + context.paneWidth

            ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)'
            ctx.lineWidth = 1
            ctx.setLineDash([4, 4])
            ctx.beginPath()
            ctx.moveTo(lineStartX, y80)
            ctx.lineTo(lineEndX, y80)
            ctx.moveTo(lineStartX, y20)
            ctx.lineTo(lineEndX, y20)
            ctx.stroke()
            ctx.setLineDash([])

            // 绘制 FASTK 线
            const drawStart = Math.max(range.start, config.period - 1)
            const drawEnd = Math.min(range.end, klineData.length)

            if (config.showFASTK) {
                ctx.strokeStyle = KDJ_COLORS.K
                ctx.lineWidth = 1
                ctx.lineJoin = 'round'
                ctx.lineCap = 'round'
                ctx.beginPath()
                let isFirst = true

                for (let i = drawStart; i < drawEnd; i++) {
                    const value = fastkData[i]
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
 * 计算指定索引处的 FASTK 值
 */
export function calcFASTKAtIndex(
    data: KLineData[],
    index: number,
    period: number
): number | undefined {
    const fastkData = calcFASTKData(data, period)
    return fastkData[index]
}

/**
 * 获取 FASTK 标题信息（供 paneTitle 使用）
 */
export function getFASTKTitleInfo(
    data: KLineData[],
    index: number,
    period: number = 9
): { name: string; params: number[]; values: Array<{ label: string; value: number; color: string }> } | null {
    if (index < period || index >= data.length) return null

    const fastkValue = calcFASTKAtIndex(data, index, period)
    if (fastkValue === undefined) return null

    return {
        name: 'FASTK',
        params: [period],
        values: [
            { label: 'FASTK', value: fastkValue, color: KDJ_COLORS.K },
        ],
    }
}
