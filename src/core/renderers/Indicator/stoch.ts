import type { RendererPlugin, RenderContext } from '@/plugin'
import { RENDERER_PRIORITY } from '@/plugin'
import type { KLineData } from '@/types/price'
import { KDJ_COLORS } from '@/core/theme/colors'
import { alignToPhysicalPixelCenter } from '@/core/draw/pixelAlign'

export interface STOCHConfig {
    /** K 周期（默认 9） */
    n?: number
    /** D 周期（默认 3） */
    m?: number
    /** 是否显示 K 线 */
    showK?: boolean
    /** 是否显示 D 线 */
    showD?: boolean
}

interface STOCHPoint {
    k: number
    d: number
}

/**
 * 计算 STOCH 数据
 * K = (C - L_n) / (H_n - L_n) * 100
 * D = K 的 M 日移动平均
 */
function calcSTOCHData(data: KLineData[], n: number, m: number): STOCHPoint[] {
    const result: STOCHPoint[] = new Array(data.length)

    if (data.length < n) return result

    // 先计算 RSV 和 K
    const kValues: (number | undefined)[] = new Array(data.length)

    for (let i = n - 1; i < data.length; i++) {
        let highest = -Infinity
        let lowest = Infinity

        for (let j = 0; j < n; j++) {
            const item = data[i - j]
            if (!item) continue
            highest = Math.max(highest, item.high)
            lowest = Math.min(lowest, item.low)
        }

        const close = data[i]!.close
        if (highest === lowest) {
            kValues[i] = 50 // 避免除零
        } else {
            kValues[i] = ((close - lowest) / (highest - lowest)) * 100
        }
    }

    // 计算 D (K 的 M 日移动平均)
    for (let i = n - 1 + m - 1; i < data.length; i++) {
        const k = kValues[i]
        if (k === undefined) continue

        // 计算 D
        let sum = 0
        let validCount = 0
        for (let j = 0; j < m; j++) {
            const kv = kValues[i - j]
            if (kv !== undefined) {
                sum += kv
                validCount++
            }
        }

        if (validCount === m) {
            result[i] = {
                k: k,
                d: sum / m,
            }
        }
    }

    return result
}

export interface STOCHRendererOptions {
    /** 目标 pane ID（默认 'sub'） */
    paneId?: string
    /** 初始配置 */
    config?: STOCHConfig
}

/**
 * 创建 STOCH 渲染器插件
 */
export function createSTOCHRendererPlugin(options: STOCHRendererOptions = {}): RendererPlugin {
    const { paneId = 'sub', config: initialConfig = {} } = options

    const config: Required<STOCHConfig> = {
        n: 9,
        m: 3,
        showK: true,
        showD: true,
        ...initialConfig,
    }

    // 缓存计算结果
    let cachedData: KLineData[] | null = null
    let cachedN = 0
    let cachedM = 0
    let stochPoints: STOCHPoint[] = []

    function getSTOCHData(data: KLineData[]) {
        if (
            cachedData !== data ||
            cachedN !== config.n ||
            cachedM !== config.m
        ) {
            stochPoints = calcSTOCHData(data, config.n, config.m)
            cachedData = data
            cachedN = config.n
            cachedM = config.m
        }
        return stochPoints
    }

    return {
        name: `stoch_${paneId}`,
        version: '1.0.0',
        description: 'STOCH 随机指标渲染器',
        debugName: 'STOCH',
        paneId: paneId,
        priority: RENDERER_PRIORITY.MAIN,

        draw(context: RenderContext) {
            const { ctx, pane, data, range, scrollLeft, kWidth, dpr, kLinePositions } = context
            const klineData = data as KLineData[]
            if (klineData.length < config.n + config.m - 1) return

            const stochData = getSTOCHData(klineData)

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

            const drawStart = Math.max(range.start, config.n + config.m - 2)
            const drawEnd = Math.min(range.end, klineData.length)

            // 绘制 K 线
            if (config.showK) {
                ctx.strokeStyle = KDJ_COLORS.K
                ctx.lineWidth = 1
                ctx.lineJoin = 'round'
                ctx.lineCap = 'round'
                ctx.beginPath()
                let isFirst = true

                for (let i = drawStart; i < drawEnd; i++) {
                    const point = stochData[i]
                    if (!point) continue

                    const x = kLinePositions[i - range.start]
                    if (x === undefined) continue

                    const logicX = x + kWidth / 2
                    const logicY = pane.height - (point.k - valueMin) / valueRange * pane.height

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

            // 绘制 D 线
            if (config.showD) {
                ctx.strokeStyle = KDJ_COLORS.D
                ctx.lineWidth = 1
                ctx.lineJoin = 'round'
                ctx.lineCap = 'round'
                ctx.beginPath()
                let isFirst = true

                for (let i = drawStart; i < drawEnd; i++) {
                    const point = stochData[i]
                    if (!point) continue

                    const x = kLinePositions[i - range.start]
                    if (x === undefined) continue

                    const logicX = x + kWidth / 2
                    const logicY = pane.height - (point.d - valueMin) / valueRange * pane.height

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
            if ('n' in newConfig && newConfig.n !== config.n) cachedData = null
            if ('m' in newConfig && newConfig.m !== config.m) cachedData = null
            Object.assign(config, newConfig)
        },
    }
}

/**
 * 计算指定索引处的 STOCH 值
 */
export function calcSTOCHAtIndex(
    data: KLineData[],
    index: number,
    n: number,
    m: number
): STOCHPoint | undefined {
    const stochData = calcSTOCHData(data, n, m)
    return stochData[index]
}

/**
 * 获取 STOCH 标题信息（供 paneTitle 使用）
 */
export function getSTOCHTitleInfo(
    data: KLineData[],
    index: number,
    n: number = 9,
    m: number = 3
): { name: string; params: number[]; values: Array<{ label: string; value: number; color: string }> } | null {
    if (index < n + m - 1 || index >= data.length) return null

    const stochValue = calcSTOCHAtIndex(data, index, n, m)
    if (!stochValue) return null

    return {
        name: 'STOCH',
        params: [n, m],
        values: [
            { label: 'K', value: stochValue.k, color: KDJ_COLORS.K },
            { label: 'D', value: stochValue.d, color: KDJ_COLORS.D },
        ],
    }
}
