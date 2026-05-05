import type { RendererPluginWithHost, PluginHost, RenderContext, BaseIndicatorState } from '@/plugin'
import { RENDERER_PRIORITY } from '@/plugin'
import { createIndicatorStateKey } from '@/plugin/stateKeys'
import { TEXT_COLORS } from '@/core/theme/colors'
import { calculateTickCount } from '@/core/utils/tickCount'

interface IndicatorScaleRenderState extends BaseIndicatorState {
    valueMin: number
    valueMax: number
}

export interface IndicatorScaleRendererOptions {
    axisWidth: number
    paneId: string
    indicatorKey: string
    label: string
    decimals?: number
}

export interface DrawScaleTicksOptions {
    ctx: CanvasRenderingContext2D
    dpr: number
    axisWidth: number
    height: number
    paddingTop: number
    paddingBottom: number
    valueMin: number
    valueMax: number
    isMain: boolean
    decimals?: number
    hideEdgeTicks?: boolean
}

export function drawScaleTicks(options: DrawScaleTicksOptions): void {
    const {
        ctx,
        dpr,
        axisWidth,
        height,
        paddingTop,
        paddingBottom,
        valueMin,
        valueMax,
        isMain,
        decimals = 2,
        hideEdgeTicks = true,
    } = options

    const valueRange = valueMax - valueMin || 1

    ctx.save()
    ctx.clearRect(0, 0, axisWidth, height)

    ctx.font = `12px -apple-system,BlinkMacSystemFont,Trebuchet MS,Roboto,Ubuntu,sans-serif`
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'center'

    const centerX = axisWidth / 2
    const yStart = paddingTop
    const yEnd = Math.max(paddingTop, height - paddingBottom)
    const viewH = Math.max(0, yEnd - yStart)

    const ticks = calculateTickCount(height, isMain)
    const step = valueRange / Math.max(1, ticks - 1)

    for (let i = 0; i < ticks; i++) {
        if (hideEdgeTicks && (i === 0 || i === ticks - 1)) continue

        const value = valueMax - step * i  // 从上到下，价格递减
        const t = ticks <= 1 ? 0 : i / (ticks - 1)
        const y = Math.round(yStart + t * viewH)  // 与网格线相同的 Y 坐标计算

        ctx.fillStyle = TEXT_COLORS.SECONDARY
        ctx.fillText(
            value.toFixed(decimals),
            Math.round(centerX),
            Math.round(y)
        )
    }

    ctx.restore()
}

export function createIndicatorScaleRendererPlugin(options: IndicatorScaleRendererOptions): RendererPluginWithHost {
    const { axisWidth, paneId, indicatorKey, label, decimals = 2 } = options
    const stateKey = createIndicatorStateKey(indicatorKey, paneId)
    let pluginHost: PluginHost | null = null

    return {
        name: `${indicatorKey}Scale_${paneId}`,
        version: '1.0.0',
        description: `${label} 刻度渲染器`,
        debugName: `${label}刻度`,
        paneId,
        priority: RENDERER_PRIORITY.INDICATOR_SCALE,

        onInstall(host: PluginHost) {
            pluginHost = host
        },

        draw(context: RenderContext) {
            const { yAxisCtx, pane, dpr } = context
            if (!yAxisCtx || !pluginHost) return

            const state = pluginHost.getSharedState<IndicatorScaleRenderState>(stateKey)
            if (!state) return

            // 应用价格偏移，使刻度随拖拽平移
            const priceOffset = pane.yAxis.getPriceOffset()
            drawScaleTicks({
                ctx: yAxisCtx,
                dpr,
                axisWidth,
                height: pane.height,
                paddingTop: pane.yAxis.getPaddingTop(),
                paddingBottom: pane.yAxis.getPaddingBottom(),
                valueMin: state.valueMin + priceOffset,
                valueMax: state.valueMax + priceOffset,
                isMain: false,
                decimals,
                hideEdgeTicks: false,
            })
        },
    }
}
