import type { RendererPlugin, RenderContext } from '@/plugin'
import { RENDERER_PRIORITY } from '@/plugin'
import type { KLineData } from '@/types/price'
import { drawTimeAxis, drawCrosshairTimeLabel } from '@/utils/kLineDraw/axis'

/** 时间轴面板 ID（特殊标识，用于单独渲染） */
export const TIME_AXIS_PANE_ID = Symbol('time-axis')

/**
 * 创建时间轴渲染器插件
 * 注意：时间轴渲染到 xAxisCanvas，需要特殊处理
 */
export function createTimeAxisRendererPlugin(options: {
  height: number
  getCrosshair?: () => { x: number; index: number } | null
}): RendererPlugin {
  return {
    name: 'timeAxis',
    version: '1.0.0',
    description: '时间轴渲染器',
    debugName: '时间轴',
    paneId: TIME_AXIS_PANE_ID,
    priority: RENDERER_PRIORITY.SYSTEM_XAXIS,
    isSystem: true, // 系统渲染器，只能通过 renderPlugin 单独渲染

    draw(context: RenderContext) {
      const { ctx, data, range, scrollLeft, kWidth, kGap, dpr, paneWidth } = context
      const klineData = data as KLineData[]

      // 时间轴绘制到传入的 ctx
      const targetCtx = ctx

      // 使用 paneWidth 作为时间轴宽度，确保与视口一致
      const w = paneWidth
      const h = options.height

      targetCtx.setTransform(1, 0, 0, 1, 0, 0)
      targetCtx.scale(dpr, dpr)
      targetCtx.clearRect(0, 0, w, h)

      drawTimeAxis(targetCtx, {
        x: 0,
        y: 0,
        width: w,
        height: h,
        data: klineData,
        scrollLeft,
        kWidth,
        kGap,
        startIndex: range.start,
        endIndex: range.end,
        dpr,
        drawTopBorder: false,
        drawBottomBorder: false,
      })

      // 绘制十字线时间标签
      const crosshair = options.getCrosshair?.()
      if (crosshair && typeof crosshair.index === 'number') {
        const k = klineData[crosshair.index]
        if (k) {
          drawCrosshairTimeLabel(targetCtx, {
            x: 0,
            y: 0,
            width: w,
            height: h,
            crosshairX: crosshair.x,
            timestamp: k.timestamp,
            dpr,
            fontSize: 12,
          })
        }
      }
    },
  }
}
