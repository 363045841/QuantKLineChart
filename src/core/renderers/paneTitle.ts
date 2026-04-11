import type { RendererPlugin, RenderContext } from '@/plugin'
import { RENDERER_PRIORITY, GLOBAL_PANE_ID } from '@/plugin'
import { TEXT_COLORS } from '@/core/theme/colors'

/**
 * 单个数值项
 */
export interface TitleValueItem {
    /** 标签（如 "DIF"、"DEA"） */
    label: string
    /** 数值 */
    value: number
    /** 颜色 */
    color: string
}

/**
 * 标题信息（由指标渲染器提供）
 */
export interface TitleInfo {
    /** 指标名称（如 "MACD"） */
    name: string
    /** 参数列表（如 [12, 26, 9]） */
    params?: number[]
    /** 数值项列表 */
    values?: TitleValueItem[]
}

export interface PaneTitleOptions {
    /** 面板 ID */
    paneId: string
    /** 标题文本（静态模式） */
    title: string
    /** 副标题/描述 */
    description?: string
    /** Y 偏移（逻辑像素） */
    yOffset?: number
    /** 动态标题信息提供函数 */
    getTitleInfo?: () => TitleInfo | null
}

/**
 * 创建面板标题渲染器插件
 * 在面板左上角显示标题，支持动态指标数值显示
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
            const gap = 8

            ctx.save()
            ctx.font = `${fontSize}px Arial`
            ctx.textAlign = 'left'
            ctx.textBaseline = 'top'

            // 获取动态标题信息
            const titleInfo = currentOptions.getTitleInfo?.()

            if (titleInfo) {
                // 动态模式：显示指标名称、参数、数值
                let currentX = x

                // 绘制指标名称
                ctx.fillStyle = TEXT_COLORS.PRIMARY
                ctx.fillText(titleInfo.name, currentX, y)
                currentX += ctx.measureText(titleInfo.name).width

                // 绘制参数
                if (titleInfo.params && titleInfo.params.length > 0) {
                    const paramText = `(${titleInfo.params.join(',')})`
                    ctx.fillStyle = TEXT_COLORS.TERTIARY
                    ctx.fillText(paramText, currentX, y)
                    currentX += ctx.measureText(paramText).width + gap
                } else {
                    currentX += gap
                }

                // 绘制数值项
                if (titleInfo.values && titleInfo.values.length > 0) {
                    for (const item of titleInfo.values) {
                        const valueText = `${item.label} ${item.value.toFixed(3)}`
                        ctx.fillStyle = item.color
                        ctx.fillText(valueText, currentX, y)
                        currentX += ctx.measureText(valueText).width + gap
                    }
                }
            } else {
                // 静态模式：只显示标题
                ctx.fillStyle = TEXT_COLORS.PRIMARY
                ctx.fillText(currentOptions.title, x, y)

                // 绘制描述
                if (currentOptions.description) {
                    const titleWidth = ctx.measureText(currentOptions.title).width
                    ctx.fillStyle = TEXT_COLORS.WEAK
                    ctx.fillText(` - ${currentOptions.description}`, x + titleWidth, y)
                }
            }

            ctx.restore()
        },

        setConfig(config: Record<string, unknown>) {
            currentOptions = { ...currentOptions, ...config }
        },
    }
}
