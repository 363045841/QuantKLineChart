import type { DrawingObject, DrawingKind, DrawingAnchor, DrawingStyle } from '@/plugin'
import type { Chart } from '@/core/chart'
import { getPhysicalKLineConfig } from '@/core/utils/klineConfig'

export type DrawingToolId =
  | 'cursor'
  | 'trend-line'
  | 'ray'
  | 'h-line'
  | 'h-ray'
  | 'v-line'
  | 'crosshair-line'
  | 'info-line'

export interface DrawingAnchorInput {
  time: number
  price: number
}

export interface DrawingInteractionCallbacks {
  onDrawingCreated?: (drawing: DrawingObject) => void
  onToolChange?: (toolId: DrawingToolId) => void
  onDrawingSelected?: (drawing: DrawingObject | null) => void
}

type HitResult =
  | { drawing: DrawingObject; anchorIndex: number }
  | { drawing: DrawingObject }

interface DragState {
  drawingId: string
  anchorIndex?: number
  snapshot: DrawingAnchor[]
  startMouse: { x: number; y: number }
}

const ANCHOR_HIT_RADIUS = 8
const LINE_HIT_RADIUS = 6

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
  private previewDrawingId = '__preview__'
  private dragState: DragState | null = null
  private selectedDrawingId: string | null = null

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
    this.removePreview()
    this.dragState = null
    this.setSelected(null)
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
    this.removePreview()
    this.dragState = null
    this.setSelected(null)
  }

  getSelectedDrawing(): DrawingObject | null {
    if (!this.selectedDrawingId) return null
    return this.drawings.find((d) => d.id === this.selectedDrawingId) ?? null
  }

  updateDrawingStyle(drawingId: string, style: Partial<DrawingStyle>): void {
    this.drawings = this.drawings.map((d) =>
      d.id === drawingId ? { ...d, style: { ...d.style, ...style } } : d
    )
    this.chart.setDrawings(this.drawings)
  }

  removeDrawing(drawingId: string): void {
    this.drawings = this.drawings.filter((d) => d.id !== drawingId)
    if (this.selectedDrawingId === drawingId) {
      this.setSelected(null)
    }
    this.chart.setDrawings(this.drawings)
  }

  /**
   * 处理指针移动事件
   * @returns 是否处理了事件（阻止冒泡）
   */
  onPointerMove(e: PointerEvent, container: HTMLElement): boolean {
    // 拖拽已有图元
    if (this.dragState) {
      return this.handleDragMove(e, container)
    }

    // 创建预览
    if (this.activeTool !== 'cursor') {
      return this.handlePreviewMove(e, container)
    }

    return false
  }

  /**
   * 处理指针按下事件
   * @returns 是否处理了事件（阻止冒泡）
   */
  onPointerDown(e: PointerEvent, container: HTMLElement): boolean {
    // 光标模式：命中检测已有图元
    if (this.activeTool === 'cursor') {
      return this.handleCursorDown(e, container)
    }

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

  /**
   * 处理指针释放事件
   * @returns 是否处理了事件（阻止冒泡）
   */
  onPointerUp(_e: PointerEvent, _container: HTMLElement): boolean {
    if (!this.dragState) return false
    this.dragState = null
    return true
  }

  // ============ 光标模式：命中检测与拖拽 ============

  private handleCursorDown(e: PointerEvent, container: HTMLElement): boolean {
    const rect = container.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    const hit = this.hitTest(mouseX, mouseY)
    if (!hit) {
      this.setSelected(null)
      return false
    }

    this.setSelected(hit.drawing)

    this.dragState = {
      drawingId: hit.drawing.id,
      anchorIndex: 'anchorIndex' in hit ? hit.anchorIndex : undefined,
      snapshot: hit.drawing.anchors.map((a) => ({ ...a })),
      startMouse: { x: mouseX, y: mouseY },
    }
    return true
  }

  private handleDragMove(e: PointerEvent, container: HTMLElement): boolean {
    if (!this.dragState) return false

    const drawing = this.drawings.find((d) => d.id === this.dragState!.drawingId)
    if (!drawing) {
      this.dragState = null
      return false
    }

    const newAnchor = this.resolveAnchorFromPointer(e, container)

    if (this.dragState.anchorIndex !== undefined) {
      // 拖拽单个锚点
      if (newAnchor) {
        const idx = this.dragState.anchorIndex
        drawing.anchors[idx] = {
          ...drawing.anchors[idx]!,
          time: newAnchor.time,
          price: newAnchor.price,
        }
      }
    } else {
      // 拖拽整条线：基于鼠标偏移量移动所有锚点
      const rect = container.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top
      const dx = mouseX - this.dragState.startMouse.x
      const dy = mouseY - this.dragState.startMouse.y

      for (let i = 0; i < drawing.anchors.length; i++) {
        const snap = this.dragState.snapshot[i]!
        const snapScreen = this.anchorToScreen(snap)
        if (!snapScreen) continue

        const targetX = snapScreen.x + dx
        const targetY = snapScreen.y + dy
        const newFromScreen = this.screenToAnchor(targetX, targetY, container)
        if (newFromScreen) {
          drawing.anchors[i] = {
            ...drawing.anchors[i]!,
            time: newFromScreen.time,
            price: newFromScreen.price,
          }
        }
      }
    }

    this.chart.setDrawings([...this.drawings])
    return true
  }

  // ============ 预览模式 ============

  private handlePreviewMove(e: PointerEvent, container: HTMLElement): boolean {
    const anchor = this.resolveAnchorFromPointer(e, container)
    if (!anchor) return false

    const isSingle = DrawingInteractionController.SINGLE_ANCHOR_TOOLS.includes(this.activeTool)
    const isDouble = DrawingInteractionController.DOUBLE_ANCHOR_TOOLS.includes(this.activeTool)
    if (!isSingle && !isDouble) return false

    let preview: DrawingObject
    if (isSingle) {
      preview = {
        id: this.previewDrawingId,
        kind: this.getDrawingKind(this.activeTool),
        paneId: 'main',
        visible: true,
        anchors: [{ id: `${this.previewDrawingId}-a`, time: anchor.time, price: anchor.price }],
        params: {},
        style: {
          stroke: '#2962ff',
          strokeWidth: 1,
          strokeStyle: 'dashed',
        },
      }
    } else if (this.pendingAnchor) {
      preview = {
        id: this.previewDrawingId,
        kind: this.activeTool as DrawingKind,
        paneId: 'main',
        visible: true,
        anchors: [
          { id: `${this.previewDrawingId}-a`, time: this.pendingAnchor.time, price: this.pendingAnchor.price },
          { id: `${this.previewDrawingId}-b`, time: anchor.time, price: anchor.price },
        ],
        params: {},
        style: {
          stroke: '#2962ff',
          strokeWidth: 1,
          strokeStyle: 'dashed',
        },
      }
    } else {
      return false
    }

    this.drawings = this.drawings.filter((d) => d.id !== this.previewDrawingId)
    this.drawings = [...this.drawings, preview]
    this.chart.setDrawings(this.drawings)
    return true
  }

  // ============ 命中检测 ============

  private hitTest(mouseX: number, mouseY: number): HitResult | null {
    const drawings = this.drawings.filter((d) => d.id !== this.previewDrawingId && d.visible)

    // 锚点优先
    for (const drawing of drawings) {
      for (let i = 0; i < drawing.anchors.length; i++) {
        const screen = this.anchorToScreen(drawing.anchors[i]!)
        if (!screen) continue
        const dist = Math.hypot(mouseX - screen.x, mouseY - screen.y)
        if (dist <= ANCHOR_HIT_RADIUS) {
          return { drawing, anchorIndex: i }
        }
      }
    }

    // 线条其次
    for (const drawing of drawings) {
      const segments = this.getDrawingLineSegments(drawing)
      for (const seg of segments) {
        const dist = pointToSegmentDist(mouseX, mouseY, seg.a, seg.b)
        if (dist <= LINE_HIT_RADIUS) {
          return { drawing }
        }
      }
    }

    return null
  }

  private getDrawingLineSegments(drawing: DrawingObject): { a: { x: number; y: number }; b: { x: number; y: number } }[] {
    const viewport = this.chart.getViewport()
    if (!viewport) return []

    // 单锚点图元：根据 kind 构造屏幕线段
    if (drawing.anchors.length === 1) {
      const screen = this.anchorToScreen(drawing.anchors[0]!)
      if (!screen) return []

      const paneRenderer = this.chart.getPaneRenderers().find((item) => item.getPane().id === 'main')
      const pane = paneRenderer?.getPane()
      if (!pane) return []

      const right = viewport.plotWidth
      const bottom = pane.height

      switch (drawing.kind) {
        case 'horizontal-line':
          return [{ a: { x: 0, y: screen.y }, b: { x: right, y: screen.y } }]
        case 'horizontal-ray':
          return [{ a: screen, b: { x: right, y: screen.y } }]
        case 'vertical-line':
          return [{ a: { x: screen.x, y: 0 }, b: { x: screen.x, y: bottom } }]
        case 'cross-line':
          return [
            { a: { x: 0, y: screen.y }, b: { x: right, y: screen.y } },
            { a: { x: screen.x, y: 0 }, b: { x: screen.x, y: bottom } },
          ]
        default:
          return []
      }
    }

    // 多锚点图元
    const points = drawing.anchors.map((a) => this.anchorToScreen(a)).filter(Boolean) as { x: number; y: number }[]
    if (points.length < 2) return []

    const segments: { a: { x: number; y: number }; b: { x: number; y: number } }[] = []

    // 根据延伸模式扩展线段到屏幕边缘
    if (points.length === 2) {
      const a = points[0]!
      const b = points[1]!
      const dx = b.x - a.x
      const dy = b.y - a.y

      let start = a
      let end = b

      const extend = this.getExtendMode(drawing)
      const maxLen = Math.max(viewport.plotWidth, viewport.plotHeight) * 4

      if (extend === 'right' || extend === 'both') {
        end = { x: b.x + dx * maxLen, y: b.y + dy * maxLen }
      }
      if (extend === 'left' || extend === 'both') {
        start = { x: a.x - dx * maxLen, y: a.y - dy * maxLen }
      }

      segments.push({ a: start, b: end })
    } else {
      for (let i = 0; i < points.length - 1; i++) {
        segments.push({ a: points[i]!, b: points[i + 1]! })
      }
    }

    return segments
  }

  private getExtendMode(drawing: DrawingObject): 'none' | 'left' | 'right' | 'both' {
    switch (drawing.kind) {
      case 'ray':
        return 'right'
      case 'extended-line':
        return 'both'
      default:
        return 'none'
    }
  }

  // ============ 坐标转换 ============

  private anchorToScreen(anchor: DrawingAnchor): { x: number; y: number } | null {
    const data = this.chart.getData()
    const viewport = this.chart.getViewport()
    if (!viewport || data.length === 0) return null

    const opt = this.chart.getOption()
    const dpr = this.chart.getCurrentDpr()
    const { startXPx, unitPx } = getPhysicalKLineConfig(opt.kWidth, opt.kGap, dpr)

    const time = typeof anchor.time === 'string' ? Number(anchor.time) : anchor.time
    const dataIndex = data.findIndex((item) => item.timestamp === time)
    if (dataIndex < 0) return null

    const x = (startXPx + dataIndex * unitPx + (unitPx - 1) / 2) / dpr - viewport.scrollLeft

    const paneRenderer = this.chart.getPaneRenderers().find((item) => item.getPane().id === 'main')
    const pane = paneRenderer?.getPane()
    if (!pane) return null

    const y = pane.yAxis.priceToY(anchor.price)
    return { x, y }
  }

  private screenToAnchor(
    screenX: number,
    screenY: number,
    container: HTMLElement
  ): DrawingAnchorInput | null {
    const data = this.chart.getData()
    const viewport = this.chart.getViewport()
    if (!viewport || data.length === 0) return null

    const dataIndex = this.chart.getDataIndexAtX(screenX)
    if (dataIndex === null) return null
    const item = data[dataIndex]
    if (!item) return null

    const paneRenderer = this.chart.getPaneRenderers().find((item) => item.getPane().id === 'main')
    const pane = paneRenderer?.getPane()
    if (!pane) return null

    return {
      time: item.timestamp,
      price: pane.yAxis.yToPrice(screenY - pane.top),
    }
  }

  // ============ 工具方法 ============

  private setSelected(drawing: DrawingObject | null) {
    const newId = drawing?.id ?? null
    if (this.selectedDrawingId === newId) return
    this.selectedDrawingId = newId
    this.chart.setSelectedDrawingId(newId)
    this.callbacks.onDrawingSelected?.(drawing)
  }

  private removePreview() {
    if (!this.drawings.some((d) => d.id === this.previewDrawingId)) return
    this.drawings = this.drawings.filter((d) => d.id !== this.previewDrawingId)
    this.chart.setDrawings(this.drawings)
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
    this.drawings = this.drawings.filter((d) => d.id !== this.previewDrawingId)

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
    this.drawings = this.drawings.filter((d) => d.id !== this.previewDrawingId)

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
        return toolId
    }
  }
}

function pointToSegmentDist(
  px: number,
  py: number,
  a: { x: number; y: number },
  b: { x: number; y: number }
): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return Math.hypot(px - a.x, py - a.y)

  let t = ((px - a.x) * dx + (py - a.y) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy))
}
