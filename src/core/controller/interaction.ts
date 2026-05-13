// 交互控制中心

import type { Chart } from '../chart'
import type { MarkerEntity, CustomMarkerEntity } from '@/core/marker/registry'

interface PointerLocation {
    mouseX: number
    mouseY: number
}

export interface InteractionSnapshot {
    crosshairPos: { x: number; y: number } | null
    crosshairIndex: number | null
    crosshairPrice: number | null
    hoveredIndex: number | null
    activePaneId: string | null
    tooltipPos: { x: number; y: number }
    tooltipAnchorPlacement: 'right-bottom' | 'left-bottom'
    hoveredMarkerData: MarkerEntity | null
    hoveredCustomMarker: CustomMarkerEntity | null
    isDragging: boolean
    isResizingPaneBoundary: boolean
    isHoveringPaneBoundary: boolean
    hoveredPaneBoundaryId: string | null
    isHoveringRightAxis: boolean
}

/**
 * 交互控制器，处理拖拽滚动、缩放、十字线 hover 等交互逻辑
 */
export class InteractionController {
    private chart: Chart
    private isDragging = false
    private dragMode: 'none' | 'pan' | 'resize-separator' | 'scale-price' = 'none'
    private dragStartX = 0
    private scrollStartX = 0

    private applyPanScroll(container: HTMLDivElement, nextScrollLeft: number) {
        const maxScrollLeft = Math.max(0, container.scrollWidth - container.clientWidth)
        const clampedScrollLeft = Math.min(Math.max(0, nextScrollLeft), maxScrollLeft)
        const dpr = this.chart.getCurrentDpr()
        container.scrollLeft = Math.round(clampedScrollLeft * dpr) / dpr
    }

    /** 垂直拖动相关 */
    private dragStartY = 0
    private activePaneIdOnDrag: string | null = null

    /** 分隔线拖拽相关 */
    private activeSeparatorUpperPaneId: string | null = null
    private hoveredSeparatorUpperPaneId: string | null = null

    /** 右轴悬浮相关 */
    private hoveredRightAxisPaneId: string | null = null

    /** [触屏]:触摸会话标记，避免触摸触发的模拟 mouse 事件干扰 */
    private isTouchSession = false

    /** [触屏]:多点触摸跟踪，用于双指捏合缩放 */
    private activePointers = new Map<number, { x: number; y: number }>()
    private lastPinchDistance = 0
    private pinchCenter = { x: 0, y: 0 }
    private isPinching = false
    /** 捏合缩放回调 */
    private onPinchZoomCallback?: (delta: number, centerX: number) => void

    /** 十字线位置 */
    crosshairPos: { x: number; y: number } | null = null
    /** 十字线当前指向的 K 线索引 */
    crosshairIndex: number | null = null
    /** 十字线指向的价格（用于价格轴平移时跟随） */
    crosshairPrice: number | null = null
    /** 鼠标悬停的 K 线索引（命中 candle 时有效） */
    hoveredIndex: number | null = null
    /** 当前活跃的 pane ID */
    activePaneId: string | null = null
    /** tooltip 位置 */
    tooltipPos: { x: number; y: number } = { x: 0, y: 0 }
    /** tooltip 尺寸 */
    tooltipSize: { width: number; height: number } = { width: 220, height: 180 }
    /** tooltip 锚定位放置方向 */
    tooltipAnchorPlacement: 'right-bottom' | 'left-bottom' = 'right-bottom'
    /** 是否使用 CSS 锚定位 */
    private useTooltipAnchorPositioning = false
    /** 统一交互状态变更回调 */
    private onInteractionChangeCallback?: (snapshot: InteractionSnapshot) => void

    /** 当前 hover 的 marker ID */
    hoveredMarkerId: string | null = null
    /** 当前点击的 marker ID */
    clickedMarkerId: string | null = null
    /** 当前 hover 的 marker 数据（供外部显示 tooltip 使用） */
    hoveredMarkerData: MarkerEntity | null = null
    /** 当前点击的 marker 数据（供外部显示 tooltip 使用） */
    clickedMarkerData: MarkerEntity | null = null
    /** marker hover 回调函数 */
    private onMarkerHoverCallback?: (marker: MarkerEntity | null) => void
    /** marker click 回调函数 */
    private onMarkerClickCallback?: (marker: MarkerEntity) => void

    /** 当前 hover 的自定义标记 */
    hoveredCustomMarker: CustomMarkerEntity | null = null
    /** 自定义标记 hover 回调 */
    private onCustomMarkerHoverCallback?: (marker: CustomMarkerEntity | null) => void
    /** 自定义标记 click 回调 */
    private onCustomMarkerClickCallback?: (marker: CustomMarkerEntity) => void

    /** 当前帧的 K 线起始 x 坐标数组 */
    private kLinePositions: number[] | null = null
    /** 当前帧的可见 K 线索引范围 */
    private visibleRange: { start: number; end: number } | null = null

    /** K 线宽度（物理像素），用于计算 K 线中心偏移 */
    private kWidthPx: number | null = null

    constructor(chart: Chart) {
        this.chart = chart
    }

    /** 设置捏合缩放回调 */
    setOnPinchZoom(callback: (delta: number, centerX: number) => void) {
        this.onPinchZoomCallback = callback
    }

    getInteractionSnapshot(): InteractionSnapshot {
        return {
            crosshairPos: this.crosshairPos ? { ...this.crosshairPos } : null,
            crosshairIndex: this.crosshairIndex,
            crosshairPrice: this.crosshairPrice,
            hoveredIndex: this.hoveredIndex,
            activePaneId: this.activePaneId,
            tooltipPos: { ...this.tooltipPos },
            tooltipAnchorPlacement: this.tooltipAnchorPlacement,
            hoveredMarkerData: this.hoveredMarkerData,
            hoveredCustomMarker: this.hoveredCustomMarker,
            isDragging: this.isDragging,
            isResizingPaneBoundary: this.dragMode === 'resize-separator',
            isHoveringPaneBoundary: this.hoveredSeparatorUpperPaneId !== null,
            hoveredPaneBoundaryId: this.hoveredSeparatorUpperPaneId,
            isHoveringRightAxis: this.hoveredRightAxisPaneId !== null,
        }
    }

    setOnInteractionChange(callback: (snapshot: InteractionSnapshot) => void) {
        this.onInteractionChangeCallback = callback
    }

    private notifyInteractionChange() {
        this.onInteractionChangeCallback?.(this.getInteractionSnapshot())
    }

    /**
     * [触屏]:处理 Pointer 按下事件
     * @param e PointerEvent
     */
    onPointerDown(e: PointerEvent) {
        // 多点触控支持：追踪所有指针，不只是主指针
        this.isTouchSession = e.pointerType === 'touch'
        this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

        // 双指捏合开始
        if (this.activePointers.size === 2 && this.isTouchSession) {
            this.isPinching = true
            this.isDragging = false
            this.dragMode = 'none'
            const pointers = Array.from(this.activePointers.values())
            const p1 = pointers[0]!
            const p2 = pointers[1]!
            this.lastPinchDistance = Math.hypot(p2.x - p1.x, p2.y - p1.y)
            this.pinchCenter = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }
            return
        }

        // 单指操作（需要是主指针且不在捏合中，且不是捏合后的残余手指）
        if (e.isPrimary === false || this.isPinching) return
        // 捏合后可能还有一根手指残留，此时忽略单指拖拽
        if (this.activePointers.size > 1) return

        const location = this.getPlotPointerLocation(e.clientX, e.clientY)
        if (!location) return

        const container = this.chart.getDom().container
        const { mouseX, mouseY } = location
        const scrollLeft = container.scrollLeft

        const markerManager = this.chart.getMarkerManager()
        const worldX = scrollLeft + mouseX
        const hitMarker = markerManager.hitTest(worldX, mouseY, 3)

        if (hitMarker) {
            this.clickedMarkerId = hitMarker.id
            this.clickedMarkerData = hitMarker
            if (this.onMarkerClickCallback) {
                this.onMarkerClickCallback(hitMarker)
            }
            return
        }

        const separatorUpperPaneId = this.hitTestPaneSeparator(mouseY)
        if (separatorUpperPaneId) {
            this.isDragging = true
            this.dragMode = 'resize-separator'
            this.dragStartY = e.clientY
            this.activeSeparatorUpperPaneId = separatorUpperPaneId
            this.hoveredSeparatorUpperPaneId = separatorUpperPaneId
            this.clearHover()
            this.chart.scheduleDraw()
            return
        }

        const pane = this.getPaneByY(mouseY)
        this.isDragging = true
        this.dragMode = 'pan'
        this.updatePlotHoverFromPoint(e.clientX, e.clientY)
        this.dragStartX = e.clientX
        this.dragStartY = e.clientY
        this.scrollStartX = container.scrollLeft
        this.activePaneIdOnDrag = pane?.id || null

        this.chart.scheduleDraw()
    }



    /**
     * 设置 tooltip 尺寸
     * @param size 宽高对象
     */
    setTooltipSize(size: { width: number; height: number }) {
        this.tooltipSize = size
    }

    setTooltipAnchorPositioning(enabled: boolean) {
        this.useTooltipAnchorPositioning = enabled
    }

    /**
     * 处理 Pointer 抬起事件
     * @param e PointerEvent
     */
    onPointerUp(e: PointerEvent) {
        // 移除指针
        this.activePointers.delete(e.pointerId)

        // 捏合结束
        if (this.isPinching && this.activePointers.size < 2) {
            this.isPinching = false
            this.lastPinchDistance = 0
        }

        if (e.isPrimary === false) return
        this.isDragging = false
        this.dragMode = 'none'
        this.activePaneIdOnDrag = null
        this.activeSeparatorUpperPaneId = null
        this.notifyInteractionChange()
    }

    /**
     * 处理 Pointer 离开事件
     * @param e PointerEvent
     */
    onPointerLeave(e: PointerEvent) {
        // 清理指针跟踪（必须先于 isPrimary 检查，否则非主指针泄漏）
        this.activePointers.delete(e.pointerId)
        if (this.activePointers.size < 2) {
            this.isPinching = false
            this.lastPinchDistance = 0
        }

        if (e.isPrimary === false) return

        this.isDragging = false
        this.dragMode = 'none'
        this.activePaneIdOnDrag = null
        this.clearSeparatorState()
        this.isTouchSession = false
        this.clearHover()
        this.chart.scheduleDraw()
        this.notifyInteractionChange()
    }

    /** 处理滚动事件 */
    onScroll() {
        this.kLinePositions = null
        this.visibleRange = null
        this.clearHover()
        this.chart.scheduleDraw()
        this.notifyInteractionChange()
    }

    /**
     * 处理 Pointer 移动事件（支持鼠标和触屏）
     * @param e PointerEvent
     */
    onPointerMove(e: PointerEvent) {
        // 更新指针位置
        if (this.activePointers.has(e.pointerId)) {
            this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
        }

        // 处理双指捏合
        if (this.isPinching && this.activePointers.size === 2) {
            const pointers = Array.from(this.activePointers.values())
            const p1 = pointers[0]!
            const p2 = pointers[1]!
            const distance = Math.hypot(p2.x - p1.x, p2.y - p1.y)
            const deltaDistance = distance - this.lastPinchDistance

            // 距离变化超过阈值时触发缩放（10px 防止高 DPR 设备过于敏感）
            if (Math.abs(deltaDistance) > 10) {
                const pinchDelta = deltaDistance > 0 ? 1 : -1
                const centerX = (p1.x + p2.x) / 2
                this.onPinchZoomCallback?.(pinchDelta, centerX)
                this.lastPinchDistance = distance
            }
            return
        }

        if (!e.isPrimary) return

        if (e.pointerType === 'touch') {
            this.isTouchSession = true
        }

        const container = this.chart.getDom().container

        if (this.isDragging) {
            if (this.dragMode === 'resize-separator') {
                const deltaY = e.clientY - this.dragStartY
                if (deltaY !== 0 && this.activeSeparatorUpperPaneId) {
                    const resized = this.chart.resizePaneBoundary(this.activeSeparatorUpperPaneId, deltaY)
                    if (resized) {
                        this.dragStartY = e.clientY
                    }
                }
                return
            }

            if (this.dragMode === 'scale-price') {
                const deltaY = e.clientY - this.dragStartY
                if (deltaY !== 0 && this.activePaneIdOnDrag) {
                    this.chart.scalePrice(this.activePaneIdOnDrag, deltaY)
                    this.dragStartY = e.clientY
                }
                return
            }

            if (this.dragMode === 'pan') {
                const deltaX = this.dragStartX - e.clientX
                this.applyPanScroll(container, this.scrollStartX + deltaX)

                const deltaY = e.clientY - this.dragStartY
                if (deltaY !== 0 && this.activePaneIdOnDrag === 'main') {
                    this.chart.translatePrice(this.activePaneIdOnDrag, deltaY)
                    this.dragStartY = e.clientY
                }
            }
            return
        }

        const location = this.getPlotPointerLocation(e.clientX, e.clientY)
        if (!location) return
        this.hoveredSeparatorUpperPaneId = this.hitTestPaneSeparator(location.mouseY)

        this.updatePlotHoverFromPoint(e.clientX, e.clientY)
        this.chart.scheduleDraw()
        this.notifyInteractionChange()
    }


    /**
     * 设置当前帧的 K 线起始 x 坐标数组和可见范围
     * @param positions K 线起始 x 坐标数组
     * @param visibleRange 可见 K 线索引范围
     * @param kWidthPx K 线宽度（物理像素）
     */
    setKLinePositions(
        positions: number[] | null,
        visibleRange: { start: number; end: number } | null,
        kWidthPx?: number
    ) {
        this.kLinePositions = positions
        this.visibleRange = visibleRange
        if (kWidthPx !== undefined) {
            this.kWidthPx = kWidthPx
        }
    }

    onRightAxisPointerDown(e: PointerEvent) {
        if (e.isPrimary === false) return
        this.isTouchSession = e.pointerType === 'touch'
        const location = this.getRightAxisPointerLocation(e.clientX, e.clientY)
        if (!location) return
        if (this.beginScalePriceDrag(e.clientY, location.mouseY)) {
            this.chart.scheduleDraw()
            this.notifyInteractionChange()
        }
    }

    onRightAxisPointerMove(e: PointerEvent) {
        if (!e.isPrimary) return
        if (e.pointerType === 'touch') {
            this.isTouchSession = true
        }

        if (this.isDragging && this.dragMode === 'scale-price') {
            const deltaY = e.clientY - this.dragStartY
            if (deltaY !== 0 && this.activePaneIdOnDrag) {
                this.chart.scalePrice(this.activePaneIdOnDrag, deltaY)
                this.dragStartY = e.clientY
            }
            return
        }

        this.updateRightAxisHoverFromPoint(e.clientX, e.clientY)
        this.chart.scheduleDraw()
        this.notifyInteractionChange()
    }

    onRightAxisPointerUp(e: PointerEvent) {
        this.onPointerUp(e)
    }

    onRightAxisPointerLeave(e: PointerEvent) {
        if (e.isPrimary === false) return
        if (this.isDragging && this.dragMode === 'scale-price') return
        this.hoveredRightAxisPaneId = null
        this.notifyInteractionChange()
    }

    /** 检查是否正在拖拽 */
    isDraggingState(): boolean {
        return this.isDragging
    }

    /** 设置 marker hover 回调 */
    setOnMarkerHover(callback: (marker: MarkerEntity | null) => void) {
        this.onMarkerHoverCallback = callback
    }

    /** 设置 marker click 回调 */
    setOnMarkerClick(callback: (marker: MarkerEntity) => void) {
        this.onMarkerClickCallback = callback
    }

    /** 设置自定义标记 hover 回调 */
    setOnCustomMarkerHover(callback: (marker: CustomMarkerEntity | null) => void) {
        this.onCustomMarkerHoverCallback = callback
    }

    /** 设置自定义标记 click 回调 */
    setOnCustomMarkerClick(callback: (marker: CustomMarkerEntity) => void) {
        this.onCustomMarkerClickCallback = callback
    }

    /** 命中可拖拽分隔线（返回上方 paneId） */
    private hitTestPaneSeparator(mouseY: number): string | null {
        const paneRenderers = this.chart.getPaneRenderers()
        if (paneRenderers.length < 2) return null

        const SEP_HIT_HALF = 5
        for (let i = 0; i < paneRenderers.length - 1; i++) {
            const upper = paneRenderers[i]?.getPane()
            const lower = paneRenderers[i + 1]?.getPane()
            if (!upper || !lower) continue
            const boundaryY = upper.top + upper.height
            if (Math.abs(mouseY - boundaryY) <= SEP_HIT_HALF) {
                return upper.id
            }
        }
        return null
    }

    private getPaneByY(mouseY: number) {
        const paneRenderers = this.chart.getPaneRenderers()
        const renderer = paneRenderers.find((r) => {
            const pane = r.getPane()
            return mouseY >= pane.top && mouseY <= pane.top + pane.height
        })
        return renderer?.getPane() || null
    }

    private getPlotPointerLocation(clientX: number, clientY: number): PointerLocation | null {
        const container = this.chart.getDom().container
        const rect = container.getBoundingClientRect()
        const mouseX = clientX - rect.left
        const mouseY = clientY - rect.top
        return { mouseX, mouseY }
    }

    private getRightAxisPointerLocation(clientX: number, clientY: number): PointerLocation {
        const rightAxisLayer = this.chart.getDom().rightAxisLayer
        const rect = rightAxisLayer.getBoundingClientRect()
        const mouseX = clientX - rect.left
        const mouseY = clientY - rect.top
        return { mouseX, mouseY }
    }

    private beginScalePriceDrag(clientY: number, mouseY: number) {
        const pane = this.getPaneByY(mouseY)
        if (!pane) return false
        this.isDragging = true
        this.dragMode = 'scale-price'
        this.dragStartY = clientY
        this.activePaneIdOnDrag = pane.id
        this.hoveredRightAxisPaneId = pane.id
        this.hoveredSeparatorUpperPaneId = null
        this.crosshairPos = null
        this.crosshairIndex = null
        this.crosshairPrice = null
        this.hoveredIndex = null
        this.activePaneId = pane.id
        return true
    }

    clearHover() {
        this.hoveredRightAxisPaneId = null
        this.crosshairPos = null
        this.crosshairIndex = null
        this.crosshairPrice = null
        this.hoveredIndex = null
        this.activePaneId = null

        // 清除 marker hover 状态
        if (this.hoveredMarkerId !== null) {
            this.hoveredMarkerId = null
            this.hoveredMarkerData = null
            const markerManager = this.chart.getMarkerManager()
            markerManager.setHover(null)
            if (this.onMarkerHoverCallback) {
                this.onMarkerHoverCallback(null)
            }
        } else {
            this.hoveredMarkerData = null
        }

        // 清除自定义标记 hover 状态
        if (this.hoveredCustomMarker !== null) {
            this.hoveredCustomMarker = null
            if (this.onCustomMarkerHoverCallback) {
                this.onCustomMarkerHoverCallback(null)
            }
        }
    }


    private clearSeparatorState() {
        this.activeSeparatorUpperPaneId = null
        this.hoveredSeparatorUpperPaneId = null
        this.hoveredRightAxisPaneId = null
    }

    /**
     * 从屏幕坐标更新 hover 状态
     * @param clientX 屏幕 x 坐标
     * @param clientY 屏幕 y 坐标
     */

    private updateRightAxisHoverFromPoint(clientX: number, clientY: number) {
        const location = this.getRightAxisPointerLocation(clientX, clientY)
        if (!location) return

        const { mouseY } = location
        const viewport = this.chart.getViewport()
        const plotHeight = viewport?.plotHeight ?? Math.max(1, Math.round(this.chart.getDom().container.clientHeight))
        if (mouseY < 0 || mouseY > plotHeight) {
            this.hoveredRightAxisPaneId = null
            return
        }

        const pane = this.getPaneByY(mouseY)
        this.hoveredRightAxisPaneId = pane?.id || null
        this.hoveredSeparatorUpperPaneId = null
        this.crosshairPos = null
        this.crosshairIndex = null
        this.crosshairPrice = null
        this.hoveredIndex = null
        this.activePaneId = pane?.id || null
    }

    private updatePlotHoverFromPoint(clientX: number, clientY: number) {
        const location = this.getPlotPointerLocation(clientX, clientY)
        if (!location) return

        const { mouseX, mouseY } = location
        const container = this.chart.getDom().container
        const viewport = this.chart.getViewport()
        const viewWidth = viewport?.viewWidth ?? Math.max(1, Math.round(container.clientWidth))
        const viewHeight = viewport?.viewHeight ?? Math.max(1, Math.round(container.clientHeight))
        const plotWidth = viewport?.plotWidth ?? viewWidth
        const plotHeight = viewport?.plotHeight ?? viewHeight
        if (mouseX < 0 || mouseY < 0 || mouseX > plotWidth || mouseY > plotHeight) {
            this.clearHover()
            return
        }

        this.hoveredRightAxisPaneId = null

        const scrollLeft = container.scrollLeft
        const dpr = this.chart.getCurrentDpr()

        const separatorUpperPaneId = this.hitTestPaneSeparator(mouseY)
        this.hoveredSeparatorUpperPaneId = separatorUpperPaneId
        if (separatorUpperPaneId) {
            this.clearHover()
            return
        }

        const markerManager = this.chart.getMarkerManager()
        const worldX = scrollLeft + mouseX
        const hitMarker = markerManager.hitTest(worldX, mouseY, 3)

        if (hitMarker) {
            if (this.hoveredMarkerId !== hitMarker.id) {
                this.hoveredMarkerId = hitMarker.id
                this.hoveredMarkerData = hitMarker
                markerManager.setHover(hitMarker.id)
                if (this.onMarkerHoverCallback) {
                    this.onMarkerHoverCallback(hitMarker)
                }
            }
            if (this.hoveredCustomMarker !== null) {
                this.hoveredCustomMarker = null
                if (this.onCustomMarkerHoverCallback) {
                    this.onCustomMarkerHoverCallback(null)
                }
            }
            this.crosshairPos = null
            this.crosshairIndex = null
            this.crosshairPrice = null
            this.hoveredIndex = null
            return
        } else {
            if (this.hoveredMarkerId !== null) {
                this.hoveredMarkerId = null
                this.hoveredMarkerData = null
                markerManager.setHover(null)
                if (this.onMarkerHoverCallback) {
                    this.onMarkerHoverCallback(null)
                }
            }
        }

        const hitCustomMarker = markerManager.hitTestCustomMarker(mouseX, mouseY)
        if (hitCustomMarker) {
            if (this.hoveredCustomMarker?.id !== hitCustomMarker.id) {
                this.hoveredCustomMarker = hitCustomMarker
                if (this.onCustomMarkerHoverCallback) {
                    this.onCustomMarkerHoverCallback(hitCustomMarker)
                }
            }
            if (this.hoveredMarkerId !== null) {
                this.hoveredMarkerId = null
                this.hoveredMarkerData = null
                markerManager.setHover(null)
                if (this.onMarkerHoverCallback) {
                    this.onMarkerHoverCallback(null)
                }
            }
            this.crosshairPos = null
            this.crosshairIndex = null
            this.crosshairPrice = null
            this.hoveredIndex = null
            return
        } else {
            if (this.hoveredCustomMarker !== null) {
                this.hoveredCustomMarker = null
                if (this.onCustomMarkerHoverCallback) {
                    this.onCustomMarkerHoverCallback(null)
                }
            }
        }

        if (!this.kLinePositions || !this.visibleRange || !this.kWidthPx) {
            this.clearHover()
            return
        }

        const kWidthLogical = this.kWidthPx / dpr

        let lo = 0, hi = this.kLinePositions.length
        while (lo < hi) {
            const mid = (lo + hi) >> 1
            if (this.kLinePositions[mid]! < worldX) {
                lo = mid + 1
            } else {
                hi = mid
            }
        }

        let localIdx = lo
        if (lo > 0 && lo < this.kLinePositions.length) {
            const prevCenter = this.kLinePositions[lo - 1]! + kWidthLogical / 2
            const currCenter = this.kLinePositions[lo]! + kWidthLogical / 2
            if (Math.abs(worldX - prevCenter) < Math.abs(worldX - currCenter)) {
                localIdx = lo - 1
            }
        } else if (lo === this.kLinePositions.length && this.kLinePositions.length > 0) {
            localIdx = this.kLinePositions.length - 1
        }

        const idx = localIdx + this.visibleRange.start
        const data = this.chart.getData()

        const pane = this.getPaneByY(mouseY)
        this.activePaneId = pane?.id || null

        if (idx >= 0 && idx < (data?.length ?? 0)) {
            this.crosshairIndex = idx

            const kLineStartX = this.kLinePositions[localIdx]!
            const snappedX = kLineStartX + (this.kWidthPx - 1) / 2 / dpr - scrollLeft

            this.crosshairPos = {
                x: Math.min(Math.max(snappedX, 0), plotWidth),
                y: Math.min(Math.max(mouseY, 0), plotHeight),
            }

            if (pane) {
                const localY = mouseY - pane.top
                this.crosshairPrice = pane.yAxis.yToPrice(localY)
            } else {
                this.crosshairPrice = null
            }
        } else {
            this.crosshairIndex = null
            this.crosshairPos = null
            this.crosshairPrice = null
        }

        const k = typeof this.crosshairIndex === 'number' ? data[this.crosshairIndex] : undefined
        if (!k || !pane || !pane.capabilities.candleHitTest) {
            this.hoveredIndex = null
            return
        }

        const localY = mouseY - pane.top
        const openY = pane.yAxis.priceToY(k.open)
        const closeY = pane.yAxis.priceToY(k.close)
        const highY = pane.yAxis.priceToY(k.high)
        const lowY = pane.yAxis.priceToY(k.low)
        const bodyTop = Math.min(openY, closeY)
        const bodyBottom = Math.max(openY, closeY)

        const kLineStartX = this.kLinePositions[localIdx]!
        const inUnitX = worldX - kLineStartX
        const cxLogical = kWidthLogical / 2

        const MIN_BODY_HIT_HEIGHT = 8
        const bodyHeight = Math.abs(bodyBottom - bodyTop)
        const effectiveBodyTop = bodyHeight < MIN_BODY_HIT_HEIGHT ? (bodyTop + bodyBottom) / 2 - MIN_BODY_HIT_HEIGHT / 2 : bodyTop
        const effectiveBodyBottom = bodyHeight < MIN_BODY_HIT_HEIGHT ? (bodyTop + bodyBottom) / 2 + MIN_BODY_HIT_HEIGHT / 2 : bodyBottom

        const HIT_WICK_HALF_EXTENDED = 3

        const hitBody = localY >= effectiveBodyTop && localY <= effectiveBodyBottom &&
            inUnitX >= 0 && inUnitX <= kWidthLogical
        const hitWick = Math.abs(inUnitX - cxLogical) <= HIT_WICK_HALF_EXTENDED &&
            localY >= Math.min(highY, lowY) && localY <= Math.max(highY, lowY)

        if (!hitBody && !hitWick) {
            this.hoveredIndex = null
            return
        }

        this.hoveredIndex = this.crosshairIndex

        if (this.useTooltipAnchorPositioning) {
            const padding = 12
            const preferGap = 14
            const tooltipW = this.tooltipSize.width
            const rightCandidateX = mouseX + preferGap
            const rightWouldOverflow = rightCandidateX + tooltipW + padding > plotWidth
            this.tooltipAnchorPlacement = rightWouldOverflow ? 'left-bottom' : 'right-bottom'
            this.tooltipPos = {
                x: Math.min(Math.max(mouseX, padding), Math.max(padding, plotWidth - padding)),
                y: Math.min(Math.max(mouseY, padding), Math.max(padding, plotHeight - padding)),
            }
            return
        }

        const padding = 12
        const preferGap = 14
        const tooltipW = this.tooltipSize.width
        const tooltipH = this.tooltipSize.height
        const rightX = mouseX + preferGap
        const leftX = mouseX - preferGap - tooltipW
        const desiredX = rightX + tooltipW + padding <= viewWidth ? rightX : leftX

        const desiredY = mouseY + preferGap
        const maxX = Math.max(padding, viewWidth - tooltipW - padding)
        const maxY = Math.max(padding, viewHeight - tooltipH - padding)
        this.tooltipPos = {
            x: Math.min(Math.max(desiredX, padding), maxX),
            y: Math.min(Math.max(desiredY, padding), maxY),
        }
    }


    /**
     * 重置所有交互状态（数据更新时调用）
     */
    reset(): void {
        this.isDragging = false
        this.dragMode = 'none'
        this.dragStartX = 0
        this.dragStartY = 0
        this.scrollStartX = 0
        this.activePaneIdOnDrag = null
        this.clearSeparatorState()
        this.isTouchSession = false
        this.activePointers.clear()
        this.isPinching = false
        this.lastPinchDistance = 0
        this.crosshairPos = null
        this.crosshairIndex = null
        this.crosshairPrice = null
        this.hoveredIndex = null
        this.activePaneId = null
        this.hoveredMarkerId = null
        this.clickedMarkerId = null
        this.hoveredMarkerData = null
        this.clickedMarkerData = null
        this.hoveredCustomMarker = null
        this.kLinePositions = null
        this.visibleRange = null
        this.kWidthPx = null
    }

    /** 获取十字线指向的 K 线索引 */
    getCrosshairIndex(): number | null {
        return this.crosshairIndex
    }
}
