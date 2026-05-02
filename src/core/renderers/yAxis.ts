import type { RendererPlugin, RenderContext } from '@/plugin'
import { RENDERER_PRIORITY, GLOBAL_PANE_ID } from '@/plugin'
import { drawPriceAxis, drawCrosshairPriceLabel } from '@/utils/kLineDraw/axis'
import { calculateTickCount } from '@/core/utils/tickCount'

/**
 * 创建 Y 轴渲染器插件
 * 渲染到所有面板的 Y 轴区域
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

      const ticks = calculateTickCount(pane.height, pane.id === 'main')

      drawPriceAxis(targetCtx, {
        x: 0,
        y: pane.top,
        width: options.axisWidth,
        height: pane.height,
        priceRange: pane.priceRange,
        yPaddingPx: options.yPaddingPx,
        dpr,
        ticks,
        drawLeftBorder: false,
        drawTickLines: false,
        priceOffset: pane.yAxis.getPriceOffset(),
        fontSize: 12,
      })

      // 绘制十字线价格标签
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
