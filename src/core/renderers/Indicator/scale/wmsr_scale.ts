import type { RendererPluginWithHost } from '@/plugin'
import { createIndicatorScaleRendererPlugin } from './indicator_scale'

export function createWmsrScaleRendererPlugin(options: {
    axisWidth: number
    paneId: string
}): RendererPluginWithHost {
    return createIndicatorScaleRendererPlugin({
        axisWidth: options.axisWidth,
        paneId: options.paneId,
        indicatorKey: 'wmsr',
        label: 'WMSR',
        decimals: 2,
    })
}
