import type { RendererPluginWithHost, PluginHost, RenderContext } from '@/plugin'
import { RENDERER_PRIORITY } from '@/plugin'
import { createIndicatorStateKey } from '@/plugin/stateKeys'
import type { MACDRenderState } from '../macd'
import { alignToPhysicalPixelCenter, roundToPhysicalPixel } from '@/core/draw/pixelAlign'
import { BORDER_COLORS, TEXT_COLORS, TAG_BG_COLORS } from '@/core/theme/colors'
import { calculateTickCount } from '@/core/utils/tickCount'

/**
 * 创建 MACD 刻度渲染器插件
 */
export function createMacdScaleRendererPlugin(options: {
    axisWidth: number
    paneId: string
}): RendererPluginWithHost {
    const { axisWidth, paneId } = options
    const STATE_KEY = createIndicatorStateKey('macd', paneId)
    let pluginHost: PluginHost | null = null

    return {
        name: `macdScale_${paneId}`,
        version: '1.0.0',
        description: 'MACD 刻度渲染器',
        debugName: 'MACD刻度',
        paneId: paneId,
        priority: RENDERER_PRIORITY.INDICATOR_SCALE,

        onInstall(host: PluginHost) {
            pluginHost = host
        },

        draw(context: RenderContext) {
            const { yAxisCtx, pane, dpr } = context
            if (!yAxisCtx || !pluginHost) return

            const state = pluginHost.getSharedState<MACDRenderState>(STATE_KEY)
            if (!state) return

            const { valueMin, valueMax } = state
            const valueRange = valueMax - valueMin || 1
            const { height } = pane

            yAxisCtx.save()

            // 背景
            yAxisCtx.fillStyle = TAG_BG_COLORS.TRANSPARENT
            yAxisCtx.fillRect(0, 0, axisWidth, height)

            // 左边界线
            yAxisCtx.strokeStyle = BORDER_COLORS.DARK
            yAxisCtx.lineWidth = 1
            yAxisCtx.beginPath()
            yAxisCtx.moveTo(alignToPhysicalPixelCenter(0, dpr), 0)
            yAxisCtx.lineTo(alignToPhysicalPixelCenter(0, dpr), height)
            yAxisCtx.stroke()

            // 文字样式
            yAxisCtx.font = `12px -apple-system,BlinkMacSystemFont,Trebuchet MS,Roboto,Ubuntu,sans-serif`
            yAxisCtx.textBaseline = 'middle'
            yAxisCtx.textAlign = 'center'

            const centerX = axisWidth / 2
            const yPadding = 10

            // 使用统一的刻度间距计算
            const ticks = calculateTickCount(height, false)
            const drawHeight = height - yPadding * 2
            const step = valueRange / (ticks - 1)

            for (let i = 0; i < ticks; i++) {
                const value = valueMin + step * i
                const y = yPadding + drawHeight - (value - valueMin) / valueRange * drawHeight

                // 刻度短线
                yAxisCtx.strokeStyle = BORDER_COLORS.DARK
                yAxisCtx.lineWidth = 1
                yAxisCtx.beginPath()
                const lineY = alignToPhysicalPixelCenter(y, dpr)
                yAxisCtx.moveTo(0, lineY)
                yAxisCtx.lineTo(4, lineY)
                yAxisCtx.stroke()

                // 刻度值
                yAxisCtx.fillStyle = TEXT_COLORS.SECONDARY
                yAxisCtx.fillText(
                    value.toFixed(2),
                    roundToPhysicalPixel(centerX, dpr),
                    roundToPhysicalPixel(y, dpr)
                )
            }

            yAxisCtx.restore()
        },
    }
}
