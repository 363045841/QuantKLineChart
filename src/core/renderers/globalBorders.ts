import type { RendererPlugin, RenderContext } from '@/plugin'
import { RENDERER_PRIORITY } from '@/plugin'
import { alignToPhysicalPixelCenter, roundToPhysicalPixel } from '@/core/draw/pixelAlign'
import { BORDER_COLORS } from '@/core/theme/colors'

/** 全局边框面板 ID（特殊标识，用于最后渲染） */
export const GLOBAL_BORDERS_PANE_ID = Symbol('global-borders')

/**
 * 创建全局边框渲染器插件
 * 绘制所有面板的外边框
 */
export function createGlobalBordersRendererPlugin(options: {
  getPaneInfos: () => Array<{ top: number; height: number }>
}): RendererPlugin {
  return {
    name: 'globalBorders',
    version: '1.0.0',
    description: '全局边框渲染器',
    debugName: '边框',
    paneId: GLOBAL_BORDERS_PANE_ID,
    priority: RENDERER_PRIORITY.SYSTEM_BORDER,
    isSystem: true, // 系统渲染器，只能通过 renderPlugin 单独渲染

    draw(context: RenderContext) {
      const { ctx, dpr, paneWidth, borderCtx } = context
      const panes = options.getPaneInfos()

      if (panes.length === 0) return

      // 边框绘制到 borderCtx（如果提供）或使用 ctx
      const targetCtx = borderCtx || ctx

      targetCtx.save()
      targetCtx.strokeStyle = BORDER_COLORS.DARK
      targetCtx.lineWidth = 3

      const margin = 1.5 / dpr
      const x1 = alignToPhysicalPixelCenter(margin, dpr)
      const x2 = alignToPhysicalPixelCenter(paneWidth - margin, dpr)

      let outerTop = Infinity
      let outerBottom = -Infinity
      for (const p of panes) {
        outerTop = Math.min(outerTop, p.top)
        outerBottom = Math.max(outerBottom, p.top + p.height)
      }
      outerTop = Number.isFinite(outerTop) ? outerTop : 0
      outerBottom = Number.isFinite(outerBottom) ? outerBottom : 0

      targetCtx.beginPath()
      const firstPane = panes[0]!
      const y1 = alignToPhysicalPixelCenter(firstPane.top + margin, dpr)
      targetCtx.moveTo(x1, y1)
      targetCtx.lineTo(x2, y1)

      const lastPane = panes[panes.length - 1]!
      const y2 = alignToPhysicalPixelCenter(lastPane.top + lastPane.height - margin, dpr)
      targetCtx.moveTo(x1, y2)
      targetCtx.lineTo(x2, y2)

      const yTop = alignToPhysicalPixelCenter(outerTop + margin, dpr)
      const yBottom = roundToPhysicalPixel(outerBottom - margin, dpr)
      targetCtx.moveTo(x1, yTop)
      targetCtx.lineTo(x1, yBottom)
      targetCtx.moveTo(x2, yTop)
      targetCtx.lineTo(x2, yBottom)

      for (let i = 1; i < panes.length; i++) {
        const currentPane = panes[i]!
        const y = alignToPhysicalPixelCenter(currentPane.top, dpr)
        targetCtx.moveTo(x1, y)
        targetCtx.lineTo(x2, y)
      }

      targetCtx.stroke()
      targetCtx.restore()
    },
  }
}
