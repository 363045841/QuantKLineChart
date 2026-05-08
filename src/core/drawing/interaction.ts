import type { DrawingObject, DrawingKind } from '@/plugin'
import type { Chart } from '@/core/chart'

export type DrawingToolId =
  | 'cursor'
  | 'trend-line'
  | 'ray'
  | 'h-line'
  | 'h-ray'
  | 'v-line'
  | 'crosshair-line'
  | 'info-line'
  | 'text'
  | 'measure'

export interface DrawingAnchorInput {
  time: number
  price: number
}

export interface DrawingInteractionCallbacks {
  onDrawingCreated?: (drawing: DrawingObject) => void
  onToolChange?: (toolId: DrawingToolId) => void
}

/**
 * 绘图交互控制器
 * 封装绘图工具的交互逻辑，与 Vue 组件解耦
 */
export class DrawingInteractionController {
  private chart: Chart
  private activeTool: DrawingToolId = 'cursor'
  private pendingAnchor: DrawingAnchorInput | null = null
  private drawings: DrawingObject[] = []
  private callbacks: DrawingInteractionCallbacks = {}

  // 单锚点工具列表
  private static readonly SINGLE_ANCHOR_TOOLS: DrawingToolId[] = [
    'h-line',
    'h-ray',
    'v-line',
    'crosshair-line',
  ]

  // 双锚点工具列表
  private static readonly DOUBLE_ANCHOR_TOOLS: DrawingToolId[] = [
    'trend-line',
    'ray',
    'info-line',
  ]

  constructor(chart: Chart) {
    this.chart = chart
  }

  setCallbacks(callbacks: DrawingInteractionCallbacks) {
    this.callbacks = callbacks
  }

  getActiveTool(): DrawingToolId {
    return this.activeTool
  }

  setTool(toolId: DrawingToolId) {
    this.activeTool = toolId
    this.pendingAnchor = null
    this.callbacks.onToolChange?.(toolId)
  }

  getDrawings(): DrawingObject[] {
    return this.drawings
  }

  setDrawings(drawings: DrawingObject[]) {
    this.drawings = drawings
    this.chart.setDrawings(drawings)
  }

  clear() {
    this.pendingAnchor = null
  }

  /**
   * 处理指针按下事件
   * @returns 是否处理了事件（阻止冒泡）
   */
  onPointerDown(e: PointerEvent, container: HTMLElement): boolean {
    if (this.activeTool === 'cursor') return false

    const anchor = this.resolveAnchorFromPointer(e, container)
    if (!anchor) return false

    // 单锚点工具：点击一次立即创建
    if (DrawingInteractionController.SINGLE_ANCHOR_TOOLS.includes(this.activeTool)) {
      this.createSingleAnchorDrawing(anchor)
      return true
    }

    // 双锚点工具：需要点击两次
    if (DrawingInteractionController.DOUBLE_ANCHOR_TOOLS.includes(this.activeTool)) {
      if (!this.pendingAnchor) {
        this.pendingAnchor = anchor
        return true
      }

      this.createDoubleAnchorDrawing(this.pendingAnchor, anchor)
      this.pendingAnchor = null
      return true
    }

    return false
  }

  private resolveAnchorFromPointer(
    e: PointerEvent,
    container: HTMLElement
  ): DrawingAnchorInput | null {
    const data = this.chart.getData()
    const viewport = this.chart.getViewport()
    if (!viewport || data.length === 0) return null

    const rect = container.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top
    if (mouseX < 0 || mouseY < 0 || mouseX > viewport.plotWidth || mouseY > viewport.plotHeight) {
      return null
    }

    const paneRenderer = this.chart.getPaneRenderers().find((item) => {
      const pane = item.getPane()
      return pane.id === 'main' && mouseY >= pane.top && mouseY <= pane.top + pane.height
    })
    const pane = paneRenderer?.getPane()
    if (!pane) return null

    const dataIndex = this.chart.getDataIndexAtX(mouseX)
    if (dataIndex === null) return null
    const item = data[dataIndex]
    if (!item) return null

    return {
      time: item.timestamp,
      price: pane.yAxis.yToPrice(mouseY - pane.top),
    }
  }

  private createSingleAnchorDrawing(anchor: DrawingAnchorInput) {
    const drawing: DrawingObject = {
      id: `drawing-${Date.now()}`,
      kind: this.getDrawingKind(this.activeTool),
      paneId: 'main',
      visible: true,
      anchors: [{ id: `${Date.now()}-a`, time: anchor.time, price: anchor.price }],
      params: {},
      style: {
        stroke: '#2962ff',
        strokeWidth: 1,
        strokeStyle: 'solid',
      },
    }

    this.drawings = [...this.drawings, drawing]
    this.chart.setDrawings(this.drawings)
    this.callbacks.onDrawingCreated?.(drawing)
    this.activeTool = 'cursor'
    this.callbacks.onToolChange?.('cursor')
  }

  private createDoubleAnchorDrawing(first: DrawingAnchorInput, second: DrawingAnchorInput) {
    const drawing: DrawingObject = {
      id: `drawing-${Date.now()}`,
      kind: this.activeTool as DrawingKind,
      paneId: 'main',
      visible: true,
      anchors: [
        { id: `${Date.now()}-a`, time: first.time, price: first.price },
        { id: `${Date.now()}-b`, time: second.time, price: second.price },
      ],
      params: {},
      style: {
        stroke: '#2962ff',
        strokeWidth: 1,
        strokeStyle: 'solid',
      },
    }

    this.drawings = [...this.drawings, drawing]
    this.chart.setDrawings(this.drawings)
    this.callbacks.onDrawingCreated?.(drawing)
    this.activeTool = 'cursor'
    this.callbacks.onToolChange?.('cursor')
  }

  private getDrawingKind(toolId: DrawingToolId): DrawingKind {
    switch (toolId) {
      case 'h-line':
        return 'horizontal-line'
      case 'h-ray':
        return 'horizontal-ray'
      case 'v-line':
        return 'vertical-line'
      case 'crosshair-line':
        return 'cross-line'
      default:
        return toolId as DrawingKind
    }
  }
}
