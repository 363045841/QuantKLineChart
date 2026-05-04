import type { RendererPluginWithHost } from '@/plugin'
import { createIndicatorScaleRendererPlugin } from './indicator_scale'

export function createStochScaleRendererPlugin(options: {
    axisWidth: number
    paneId: string
}): RendererPluginWithHost {
    return createIndicatorScaleRendererPlugin({
        axisWidth: options.axisWidth,
        paneId: options.paneId,
        indicatorKey: 'stoch',
        label: 'STOCH',
        decimals: 2,
    })
}
