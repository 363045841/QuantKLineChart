import type { RendererPlugin, RenderContext } from '@/plugin'
import { RENDERER_PRIORITY, GLOBAL_PANE_ID } from '@/plugin'
import { createHorizontalLineRect, createVerticalLineRect } from '@/core/draw/pixelAlign'
import { CROSSHAIR_COLORS } from '@/core/theme/colors'

/**
 * 创建十字线渲染器插件
 * 垂直线绘制到所有面板，水平线只绘制到活跃面板
 */
export function createCrosshairRendererPlugin(options: {
  getCrosshairState: () => {
    pos: { x: number; y: number } | null
    activePaneId: string | null
    isDragging: boolean
  }
}): RendererPlugin {
  return {
    name: 'crosshair',
    version: '1.0.0',
    description: '十字线渲染器',
    debugName: '十字线',
    paneId: GLOBAL_PANE_ID,
    priority: RENDERER_PRIORITY.SYSTEM_CROSSHAIR,

    draw(context: RenderContext) {
      const { ctx, pane, dpr, paneWidth } = context
      const state = options.getCrosshairState()

      if (state.isDragging || !state.pos) return

      const { x, y } = state.pos
      const isActive = pane.id === state.activePaneId

      // 垂直线在所有面板上绘制
      // 水平线只在活跃面板上绘制
      const localY = isActive ? y - pane.top : -1

      ctx.save()
      ctx.beginPath()
      ctx.rect(0, 0, paneWidth, pane.height)
      ctx.clip()

      ctx.fillStyle = CROSSHAIR_COLORS.LINE

      // 绘制垂直线
      const v = createVerticalLineRect(x, 0, pane.height, dpr)
      if (v) ctx.fillRect(v.x, v.y, v.width, v.height)

      // 绘制水平线（仅在活跃面板）
      if (isActive && localY >= 0) {
        const safeY = Math.min(localY, pane.height - 1 / dpr)
        const h = createHorizontalLineRect(0, paneWidth, safeY, dpr)
        if (h) ctx.fillRect(h.x, h.y, h.width, h.height)
      }

      ctx.restore()
    },
  }
}
