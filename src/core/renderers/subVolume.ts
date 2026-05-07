import type { RendererPluginWithHost, RenderContext, PluginHost, BaseIndicatorState } from '@/plugin'
import { RENDERER_PRIORITY } from '@/plugin'
import { createIndicatorStateKey } from '@/plugin/stateKeys'
import type { KLineData } from '@/types/price'
import { VOLUME_COLORS } from '@/core/theme/colors'

export interface VolumeRendererOptions {
    /** 目标 pane ID（默认 'sub'） */
    paneId?: string
}

export interface VolumeRenderState extends BaseIndicatorState {
    valueMin: number
    valueMax: number
}

/**
 * 创建副图成交量渲染器插件
 */
export function createVolumeRendererPlugin(options: VolumeRendererOptions = {}): RendererPluginWithHost {
    const { paneId = 'sub' } = options
    const stateKey = createIndicatorStateKey('volume', paneId)
    let pluginHost: PluginHost | null = null

    return {
        name: `volume_${paneId}`,
        version: '1.0.0',
        description: '成交量渲染器',
        debugName: '成交量',
        paneId,
        priority: RENDERER_PRIORITY.MAIN,

        onInstall(host: PluginHost) {
            pluginHost = host
        },

        getDeclaredNamespaces() {
            return [stateKey]
        },

        draw(context: RenderContext) {
            const { ctx, pane, data, range, scrollLeft, kWidth, kGap, dpr, kLinePositions } = context
            const klineData = data as KLineData[]
            if (!klineData.length) return

            ctx.save()
            ctx.translate(-scrollLeft, 0)

            const { start, end } = range

            let maxVolume = 0
            let minVolume = Infinity
            for (let i = start; i < end && i < klineData.length; i++) {
                const item = klineData[i]
                if (!item) continue
                const volume = item.volume
                if (volume !== undefined && volume !== null) {
                    maxVolume = Math.max(maxVolume, volume)
                    minVolume = Math.min(minVolume, volume)
                }
            }

            if (maxVolume === 0 || !Number.isFinite(minVolume)) {
                ctx.restore()
                return
            }

            const padding = Math.max(0.05, (maxVolume - minVolume) * 0.1)
            const valueMin = Math.max(0, minVolume - padding)
            const valueMax = maxVolume + padding
            const displayRange = pane.yAxis.getDisplayRange({ minPrice: valueMin, maxPrice: valueMax })
            const displayMin = displayRange.minPrice
            const displayMax = displayRange.maxPrice
            const displayValueRange = displayMax - displayMin || 1
            const baseY = pane.height - (0 - displayMin) / displayValueRange * pane.height

            pluginHost?.setSharedState<VolumeRenderState>(stateKey, {
                valueMin,
                valueMax,
                timestamp: Date.now(),
            }, `volume_${paneId}`)

            for (let i = start; i < end; i++) {
                const item = klineData[i]
                if (!item) continue
                const volume = item.volume
                if (!volume) continue
                const x = kLinePositions[i - start]
                if (x === undefined) continue

                const nextX = kLinePositions[i - start + 1]
                const prevX = kLinePositions[i - start - 1]
                const fallbackUnitPx = Math.max(1, Math.round((kWidth + kGap) * dpr))
                const unitPx = nextX !== undefined
                    ? Math.max(1, Math.round((nextX - x) * dpr))
                    : prevX !== undefined
                        ? Math.max(1, Math.round((x - prevX) * dpr))
                        : fallbackUnitPx

                const barWidthPx = Math.max(1, unitPx - 1)
                const barWidth = barWidthPx / dpr
                const barXPx = Math.round((x + (kWidth - barWidth) / 2) * dpr)
                const alignedBarX = barXPx / dpr

                const color = judgeColor(item)
                drawVolume(ctx, alignedBarX, color, volume, barWidth, displayMin, displayValueRange, baseY, pane.height, dpr)
            }

            ctx.restore()
        },
    }
}

/**
 * 绘制成交量柱
 */
function drawVolume(
    ctx: CanvasRenderingContext2D,
    x: number,
    color: string,
    volume: number,
    barWidth: number,
    displayMin: number,
    displayValueRange: number,
    baseY: number,
    paneHeight: number,
    dpr: number
) {
    const y = paneHeight - (volume - displayMin) / displayValueRange * paneHeight
    const alignedY = Math.round(y * dpr) / dpr
    const alignedBaseY = Math.round(baseY * dpr) / dpr
    const minBarHPx = 1 / dpr
    const rawH = alignedBaseY - alignedY
    const finalH = rawH <= 0 ? minBarHPx : Math.max(rawH, minBarHPx)
    const finalY = rawH <= 0 ? alignedBaseY - minBarHPx : alignedBaseY - finalH

    ctx.fillStyle = color
    ctx.fillRect(x, finalY, barWidth, finalH)
}

/**
 * 判断成交量柱子颜色（使用 MACD 配色风格）
 */
function judgeColor(dayData: KLineData) {
    if (dayData.close > dayData.open) {
        return VOLUME_COLORS.UP
    } else if (dayData.close < dayData.open) {
        return VOLUME_COLORS.DOWN
    } else {
        return VOLUME_COLORS.NEUTRAL
    }
}
