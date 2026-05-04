import type { RendererPluginWithHost } from '@/plugin'
import { createIndicatorScaleRendererPlugin } from './indicator_scale'

export function createFastkScaleRendererPlugin(options: {
    axisWidth: number
    paneId: string
}): RendererPluginWithHost {
    return createIndicatorScaleRendererPlugin({
        axisWidth: options.axisWidth,
        paneId: options.paneId,
        indicatorKey: 'fastk',
        label: 'FASTK',
        decimals: 2,
    })
}
