import type { RendererPluginWithHost } from '@/plugin'
import { createIndicatorScaleRendererPlugin } from './indicator_scale'

export function createMomScaleRendererPlugin(options: {
    axisWidth: number
    paneId: string
}): RendererPluginWithHost {
    return createIndicatorScaleRendererPlugin({
        axisWidth: options.axisWidth,
        paneId: options.paneId,
        indicatorKey: 'mom',
        label: 'MOM',
        decimals: 2,
    })
}
