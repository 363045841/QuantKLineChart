import type { RendererPlugin, RenderContext } from '@/plugin'
import { RENDERER_PRIORITY, GLOBAL_PANE_ID } from '@/plugin'
import { drawCrosshairPriceLabel } from '@/utils/kLineDraw/axis'
import { drawScaleTicks } from '@/core/renderers/Indicator/scale/indicator_scale'

/**
 * 创建 Y 轴渲染器插件
 * 仅渲染主图价格刻度；副图刻度由指标刻度插件负责
 */
export function createYAxisRendererPlugin(options: {
  axisWidth: number
  yPaddingPx: number
  getCrosshair?: () => { y: number; price: number } | null
}): RendererPlugin {
  return {
    name: 'yAxis',
    version: '1.0.0',
    description: 'Y轴价格刻度渲染器',
    debugName: 'Y轴',
    paneId: GLOBAL_PANE_ID,
    priority: RENDERER_PRIORITY.SYSTEM_YAXIS,

    draw(context: RenderContext) {
      const { ctx, pane, dpr, yAxisCtx } = context

      // Y 轴绘制到 yAxisCtx（如果提供）或使用 ctx
      const targetCtx = yAxisCtx || ctx

      // 副图不再走系统 Y 轴，避免与指标刻度叠加
      if (pane.id !== 'main') return

      drawScaleTicks({
        ctx: targetCtx,
        dpr,
        axisWidth: options.axisWidth,
        height: pane.height,
        paddingTop: pane.yAxis.getPaddingTop(),
        paddingBottom: pane.yAxis.getPaddingBottom(),
        valueMin: pane.priceRange.minPrice,
        valueMax: pane.priceRange.maxPrice,
        isMain: true,
        decimals: 2,
        hideEdgeTicks: true,
      })

      // 绘制十字线价格标签（仅主图）
      const crosshair = options.getCrosshair?.()
      if (crosshair && crosshair.price !== null) {
        drawCrosshairPriceLabel(targetCtx, {
          x: 0,
          y: pane.top,
          width: options.axisWidth,
          height: pane.height,
          crosshairY: crosshair.y,
          priceRange: pane.priceRange,
          yPaddingPx: options.yPaddingPx,
          dpr,
          fontSize: 12,
        })
      }
    },
  }
}
