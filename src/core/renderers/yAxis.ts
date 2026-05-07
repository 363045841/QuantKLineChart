import type { RendererPlugin, RenderContext } from '@/plugin'
import { RENDERER_PRIORITY, GLOBAL_PANE_ID } from '@/plugin'
import { drawCrosshairPriceLabel } from '@/utils/kLineDraw/axis'
import { drawScaleTicks } from '@/core/renderers/Indicator/scale/indicator_scale'
import { PRICE_COLORS } from '@/core/theme/colors'
import type { KLineData } from '@/types/price'

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
      const { ctx, pane, dpr, yAxisCtx, data } = context

      const targetCtx = yAxisCtx || ctx
      const axisWidth = yAxisCtx?.canvas ? (yAxisCtx.canvas.width / dpr) : options.axisWidth
      const displayRange = pane.yAxis.getDisplayRange(pane.priceRange)

      if (pane.capabilities.showPriceAxisTicks) {
        drawScaleTicks({
          ctx: targetCtx,
          dpr,
          axisWidth,
          height: pane.height,
          paddingTop: pane.yAxis.getPaddingTop(),
          paddingBottom: pane.yAxis.getPaddingBottom(),
          valueMin: displayRange.minPrice,
          valueMax: displayRange.maxPrice,
          isMain: true,
          decimals: 2,
          hideEdgeTicks: false,
        })
      }

      const klineData = data as KLineData[]
      const last = pane.id === 'main' ? klineData[klineData.length - 1] : null
      if (last) {
        const lastPriceY = pane.yAxis.priceToY(last.close)
        drawCrosshairPriceLabel(targetCtx, {
          x: 0,
          y: pane.top,
          width: axisWidth,
          height: pane.height,
          crosshairY: lastPriceY + pane.top,
          priceRange: displayRange,
          yPaddingPx: options.yPaddingPx,
          dpr,
          bgColor: 'rgba(255, 247, 248, 0.98)',
          borderColor: PRICE_COLORS.LAST_PRICE,
          textColor: PRICE_COLORS.LAST_PRICE,
          fontSize: 12,
          priceOffset: 0,
          price: last.close,
        })
      }

      const crosshair = options.getCrosshair?.()
      if (crosshair && crosshair.activePaneId === pane.id && crosshair.price !== null) {
        drawCrosshairPriceLabel(targetCtx, {
          x: 0,
          y: pane.top,
          width: axisWidth,
          height: pane.height,
          crosshairY: crosshair.y,
          priceRange: displayRange,
          yPaddingPx: options.yPaddingPx,
          dpr,
          fontSize: 12,
          priceOffset: 0,
          price: crosshair.price,
        })
      }
    },
  }
}
