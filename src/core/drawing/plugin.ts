import type { RendererPlugin, RenderContext, DrawingStyle, DrawingPrimitive } from '@/plugin'
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
      const { ctx, pane, data, range, dpr, paneWidth, kLinePositions, kLineCenters, kBarRects, kWidth, kGap } = context
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
          kLineCenters,
          kBarRects,
          kWidth,
          kGap,
          dpr,
          paneWidth,
          viewport,
          toScreen(anchor) {
            if (!Number.isFinite(anchor.index) || anchor.index < 0) {
              return { x: -kWidth, y: pane.yAxis.priceToY(anchor.price) }
            }
            const x = (startXPx + anchor.index * unitPx + (unitPx - 1) / 2) / dpr - viewport.scrollLeft
            return { x, y: pane.yAxis.priceToY(anchor.price) }
          },
        })
        if (!geometry) continue

        const isSelected = store.getSelectedId() === drawing.id
        const primitives = isSelected
          ? geometry.primitives.map((p) => applySelectedStyle(p, drawing.style))
          : geometry.primitives

        for (const primitive of primitives) {
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

function applySelectedStyle(primitive: DrawingPrimitive, baseStyle: DrawingStyle): DrawingPrimitive {
  const selectedStroke = baseStyle.stroke ?? '#2962ff'
  const selectedWidth = (baseStyle.strokeWidth ?? 1) + 1
  const selectedPointRadius = (baseStyle.pointRadius ?? 4) + 2

  if (primitive.kind === 'point') {
    return { ...primitive, style: { ...primitive.style, stroke: selectedStroke, pointRadius: selectedPointRadius } }
  }
  if (primitive.kind === 'line') {
    return { ...primitive, style: { ...primitive.style, stroke: selectedStroke, strokeWidth: selectedWidth } }
  }
  if (primitive.kind === 'area') {
    return { ...primitive, style: { ...primitive.style, stroke: selectedStroke } }
  }
  // text
  return { ...primitive, style: { ...primitive.style, textColor: selectedStroke, fontSize: (primitive.style?.fontSize ?? 12) + 1 } }
}
