import type { RendererPlugin, RenderContext, DrawingAnchor } from '@/plugin'
import { RENDERER_PRIORITY } from '@/plugin'
import {
  DrawingStore,
  DrawingDefinitionRegistry,
  createDefaultPrimitiveRendererSet,
  registerDefaultDrawingDefinitions,
} from './index'
import type { PrimitiveRendererSet } from './index'
import type { KLineData } from '@/types/price'
import { getPhysicalKLineConfig } from '@/core/utils/klineConfig'

function anchorToIndex(anchor: DrawingAnchor, seriesData: KLineData[]): number {
  const time = typeof anchor.time === 'string' ? Number(anchor.time) : anchor.time
  if (!Number.isFinite(time)) return -1
  return seriesData.findIndex((item) => item.timestamp === time)
}

export function createDrawingRendererPlugin(options: {
  store: DrawingStore
  paneId?: string
  definitions?: DrawingDefinitionRegistry
  renderers?: PrimitiveRendererSet
}): RendererPlugin {
  const store = options.store
  const definitions = options.definitions ?? new DrawingDefinitionRegistry()
  const renderers = options.renderers ?? createDefaultPrimitiveRendererSet()
  registerDefaultDrawingDefinitions(definitions)

  return {
    name: 'drawingRenderer',
    version: '0.1.0',
    description: '绘图渲染器',
    debugName: '绘图层',
    paneId: options.paneId ?? 'main',
    priority: RENDERER_PRIORITY.OVERLAY,
    draw(context: RenderContext) {
      const { ctx, pane, data, range, dpr, paneWidth, kLinePositions, kWidth, kGap } = context
      const viewport = context.viewport ?? {
        scrollLeft: context.scrollLeft,
        plotWidth: paneWidth,
        plotHeight: pane.height,
      }
      const { startXPx, unitPx } = getPhysicalKLineConfig(kWidth, kGap, dpr)
      const seriesData = data as KLineData[]
      const visibleData = seriesData.slice(range.start, range.end)
      const drawings = store.getVisibleByPane(pane.id)
      if (drawings.length === 0) return

      const viewportClip = {
        left: 0,
        top: 0,
        right: viewport.plotWidth,
        bottom: pane.height,
      }

      ctx.save()
      ctx.beginPath()
      ctx.rect(0, 0, viewport.plotWidth, pane.height)
      ctx.clip()

      for (const drawing of drawings) {
        const geometry = definitions.compute(drawing, {
          pane,
          visibleData,
          seriesData,
          range,
          kLinePositions,
          kWidth,
          kGap,
          dpr,
          paneWidth,
          viewport,
          toScreen(anchor) {
            const dataIndex = anchorToIndex(anchor, seriesData)
            if (dataIndex < 0) {
              return { x: -kWidth, y: pane.yAxis.priceToY(anchor.price) }
            }
            const x = (startXPx + dataIndex * unitPx + (unitPx - 1) / 2) / dpr - viewport.scrollLeft
            return { x, y: pane.yAxis.priceToY(anchor.price) }
          },
        })
        if (!geometry) continue

        for (const primitive of geometry.primitives) {
          if (primitive.kind === 'point') {
            renderers.point(ctx, primitive, dpr)
            continue
          }
          if (primitive.kind === 'line') {
            renderers.line(ctx, primitive, viewportClip, dpr)
            continue
          }
          if (primitive.kind === 'area') {
            renderers.area(ctx, primitive, dpr)
            continue
          }
          renderers.text(ctx, primitive, dpr)
        }
      }

      ctx.restore()
    },
  }
}
