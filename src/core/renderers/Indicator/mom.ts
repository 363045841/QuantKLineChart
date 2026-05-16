import type { RendererPluginWithHost, RenderContext, PluginHost, BaseIndicatorState } from '@/plugin'
import { RENDERER_PRIORITY } from '@/plugin'
import { createIndicatorStateKey } from '@/plugin/stateKeys'
import type { KLineData } from '@/types/price'
import { MOM_COLORS } from '@/core/theme/colors'
import { alignToPhysicalPixelCenter } from '@/core/draw/pixelAlign'

export interface MOMConfig {
    /** 周期（默认 10） */
    period?: number
    /** 是否显示 MOM 线 */
    showMOM?: boolean
}

/**
 * 计算 MOM 数据
 * MOM = C - C_n (当前价格减去 N 日前价格)
 */
function calcMOMData(data: KLineData[], period: number): (number | undefined)[] {
    const result: (number | undefined)[] = new Array(data.length)

    if (data.length < period + 1) return result

    for (let i = period; i < data.length; i++) {
        const currentClose = data[i]?.close
        const prevClose = data[i - period]?.close

        if (currentClose !== undefined && prevClose !== undefined) {
            result[i] = currentClose - prevClose
        }
    }

    return result
}

export interface MOMRenderState extends BaseIndicatorState {
    valueMin: number
    valueMax: number
}

export interface MOMRendererOptions {
    /** 目标 pane ID（默认 'sub'） */
    paneId?: string
    /** 初始配置 */
    config?: MOMConfig
}

/**
 * 创建 MOM 渲染器插件
 */
export function createMOMRendererPlugin(options: MOMRendererOptions = {}): RendererPluginWithHost {
    const { paneId = 'sub', config: initialConfig = {} } = options
    const STATE_KEY = createIndicatorStateKey('mom', paneId)
    let pluginHost: PluginHost | null = null

    const config: Required<MOMConfig> = {
        period: 10,
        showMOM: true,
        ...initialConfig,
    }

    // 缓存计算结果
    let cachedData: KLineData[] | null = null
    let cachedPeriod = 0
    let momValues: (number | undefined)[] = []

    function getMOMData(data: KLineData[]) {
        if (cachedData !== data || cachedPeriod !== config.period) {
            momValues = calcMOMData(data, config.period)
            cachedData = data
            cachedPeriod = config.period
        }
        return momValues
    }

    return {
        name: `mom_${paneId}`,
        version: '1.0.0',
        description: 'MOM 动量指标渲染器',
        debugName: 'MOM',
        paneId: paneId,
        priority: RENDERER_PRIORITY.MAIN,

        onInstall(host: PluginHost) {
            pluginHost = host
        },

        getDeclaredNamespaces() {
            return [STATE_KEY]
        },

        draw(context: RenderContext) {
            const { ctx, pane, data, range, scrollLeft, dpr, kLineCenters } = context
            const klineData = data as KLineData[]
            if (klineData.length < config.period + 1) return

            const momData = getMOMData(klineData)

            // 计算可见范围内的最大最小值
            let maxVal = -Infinity
            let minVal = Infinity
            for (let i = range.start; i < range.end && i < momData.length; i++) {
                const val = momData[i]
                if (val !== undefined) {
                    maxVal = Math.max(maxVal, val)
                    minVal = Math.min(minVal, val)
                }
            }

            if (!Number.isFinite(maxVal) || !Number.isFinite(minVal)) return

            // 添加上下留白
            const padding = Math.max(Math.abs(maxVal), Math.abs(minVal)) * 0.1
            maxVal = maxVal + padding
            minVal = minVal - padding

            const valueRange = maxVal - minVal || 1

            const stateData: MOMRenderState = {
                valueMin: minVal,
                valueMax: maxVal,
                timestamp: Date.now(),
            }
            pluginHost?.setSharedState<MOMRenderState>(STATE_KEY, stateData, `mom_${paneId}`)

            const displayRange = pane.yAxis.getDisplayRange({ minPrice: minVal, maxPrice: maxVal })
            const displayMin = displayRange.minPrice
            const displayMax = displayRange.maxPrice
            const displayValueRange = displayMax - displayMin || 1

            // 零轴位置
            const zeroY = pane.height - (0 - displayMin) / displayValueRange * pane.height

            ctx.save()
            ctx.translate(-scrollLeft, 0)

            // 绘制零轴
            const lineStartX = scrollLeft
            const lineEndX = scrollLeft + context.paneWidth

            ctx.strokeStyle = MOM_COLORS.ZERO
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.moveTo(lineStartX, zeroY)
            ctx.lineTo(lineEndX, zeroY)
            ctx.stroke()

            // 绘制 MOM 线
            const drawStart = Math.max(range.start, config.period)
            const drawEnd = Math.min(range.end, klineData.length)

            if (config.showMOM) {
                ctx.strokeStyle = MOM_COLORS.MOM
                ctx.lineWidth = 1
                ctx.lineJoin = 'round'
                ctx.lineCap = 'round'
                ctx.beginPath()
                let isFirst = true

                for (let i = drawStart; i < drawEnd; i++) {
                    const value = momData[i]
                    if (value === undefined) continue

                    const centerX = kLineCenters[i - range.start]
                    if (centerX === undefined) continue
                    const logicY = pane.height - (value - displayMin) / displayValueRange * pane.height

                    const px = centerX
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
 * 计算指定索引处的 MOM 值
 */
export function calcMOMAtIndex(
    data: KLineData[],
    index: number,
    period: number
): number | undefined {
    const momData = calcMOMData(data, period)
    return momData[index]
}

/**
 * 获取 MOM 标题信息（供 paneTitle 使用）
 */
export function getMOMTitleInfo(
    data: KLineData[],
    index: number,
    period: number = 10
): { name: string; params: number[]; values: Array<{ label: string; value: number; color: string }> } | null {
    if (index < period || index >= data.length) return null

    const momValue = calcMOMAtIndex(data, index, period)
    if (momValue === undefined) return null

    return {
        name: 'MOM',
        params: [period],
        values: [
            { label: 'MOM', value: momValue, color: MOM_COLORS.MOM },
        ],
    }
}
