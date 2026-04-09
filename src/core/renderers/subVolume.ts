import type { RendererPlugin, RenderContext } from '@/plugin'
import { RENDERER_PRIORITY } from '@/plugin'
import type { KLineData } from '@/types/price'
import { PRICE_COLORS } from '@/core/theme/colors'

/**
 * 创建副图成交量渲染器插件
 */
export function createVolumeRendererPlugin(): RendererPlugin {
    return {
        name: 'volume',
        version: '1.0.0',
        description: '成交量渲染器',
        debugName: '成交量',
        paneId: 'sub',
        priority: RENDERER_PRIORITY.MAIN,

        draw(context: RenderContext) {
            const { ctx, pane, data, range, scrollLeft, kWidth, kLinePositions } = context
            const klineData = data as KLineData[]
            if (!klineData.length) return

            ctx.save()
            ctx.translate(-scrollLeft, 0)

            const { start, end } = range
            const maxVolume = klineData
                .slice(start, end)
                .reduce((max, e) => {
                    if (e.volume) {
                        return Math.max(max, e.volume)
                    }
                    return max
                }, 0)

            for (let i = start; i < end; i++) {
                const item = klineData[i]
                if (!item) continue
                const volume = item.volume
                if (!volume) continue
                const color = judgeColor(item)
                const x = kLinePositions[i - start]
                if (!x) continue
                drawVolume(ctx, x, color, volume, maxVolume, kWidth, pane.height)
            }

            ctx.restore()
        },
    }
}

/**
 * 绘制成交量柱
 */
function drawVolume(ctx: CanvasRenderingContext2D, x: number, color: string, volume: number, maxVolume: number, width: number, paneHeight: number) {
    const y = volumeToY(volume, maxVolume, paneHeight)
    ctx.fillStyle = color
    ctx.fillRect(x, y, width, paneHeight - y)
}

/**
 * 判断 K 线颜色
 */
function judgeColor(dayData: KLineData) {
    if (dayData.close > dayData.open) {
        return PRICE_COLORS.UP
    } else if (dayData.close < dayData.open) {
        return PRICE_COLORS.DOWN
    } else {
        return PRICE_COLORS.NEUTRAL
    }
}

/**
 * 将成交量转换为 Y 坐标
 */
function volumeToY(volume: number, maxVolume: number, paneHeight: number): number {
    const ratio = paneHeight / maxVolume
    return paneHeight - volume * ratio
}
