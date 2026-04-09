import type { RendererPlugin, RenderContext } from '@/plugin'
import { RENDERER_PRIORITY, GLOBAL_PANE_ID } from '@/plugin'
import { TEXT_COLORS } from '@/core/theme/colors'

export interface PaneTitleOptions {
  /** 面板 ID */
  paneId: string
  /** 标题文本 */
  title: string
  /** 副标题/描述 */
  description?: string
  /** Y 偏移（逻辑像素） */
  yOffset?: number
}

/**
 * 创建面板标题渲染器插件
 * 在面板左上角显示标题
 */
export function createPaneTitleRendererPlugin(options: PaneTitleOptions): RendererPlugin {
  // 可变配置，支持动态更新
  let currentOptions = { ...options }

  return {
    name: `paneTitle_${options.paneId}`,
    version: '1.0.0',
    description: '面板标题渲染器',
    debugName: '面板标题',
    paneId: options.paneId,
    priority: RENDERER_PRIORITY.FOREGROUND,

    draw(context: RenderContext) {
      const { ctx, pane } = context
      if (pane.id !== currentOptions.paneId) return

      const fontSize = 12
      const x = 12
      const y = currentOptions.yOffset ?? fontSize

      ctx.save()
      ctx.font = `${fontSize}px Arial`
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'

      // 绘制标题
      ctx.fillStyle = TEXT_COLORS.PRIMARY
      ctx.fillText(currentOptions.title, x, y)

      // 绘制描述
      if (currentOptions.description) {
        const titleWidth = ctx.measureText(currentOptions.title).width
        ctx.fillStyle = TEXT_COLORS.WEAK
        ctx.fillText(` - ${currentOptions.description}`, x + titleWidth, y)
      }

      ctx.restore()
    },

    setConfig(config: Record<string, unknown>) {
      currentOptions = { ...currentOptions, ...config }
    },
  }
}
