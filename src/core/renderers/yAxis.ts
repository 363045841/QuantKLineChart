import type { RendererPlugin, RenderContext } from '@/plugin'
import { RENDERER_PRIORITY, GLOBAL_PANE_ID } from '@/plugin'
import { drawCrosshairPriceLabel } from '@/utils/kLineDraw/axis'
import { drawScaleTicks } from '@/core/renderers/Indicator/scale/indicator_scale'

/**
 * 创建 Y 轴渲染器插件
 * 按 pane capability 决定是否绘制刻度与价格标签
 */
export function createYAxisRendererPlugin(options: {
  axisWidth: number
  yPaddingPx: number
  getCrosshair?: () => { y: number; price: number; activePaneId: string | null } | null
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

      // 应用价格偏移，使刻度随拖拽平移
      const priceOffset = pane.yAxis.getPriceOffset()

      // 按 capability 绘制价格轴刻度
      if (pane.capabilities.showPriceAxisTicks) {
        drawScaleTicks({
          ctx: targetCtx,
          dpr,
          axisWidth: options.axisWidth,
          height: pane.height,
          paddingTop: pane.yAxis.getPaddingTop(),
          paddingBottom: pane.yAxis.getPaddingBottom(),
          valueMin: pane.priceRange.minPrice + priceOffset,
          valueMax: pane.priceRange.maxPrice + priceOffset,
          isMain: true,
          decimals: 2,
          hideEdgeTicks: false,
        })
      }

      // 绘制十字线价格标签（按 active pane）
      const crosshair = options.getCrosshair?.()
      if (crosshair && crosshair.activePaneId === pane.id && crosshair.price !== null) {
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
          priceOffset,
          price: crosshair.price,
        })
      }
    },
  }
}
