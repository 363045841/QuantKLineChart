// 交互控制中心

import type { Chart } from '../chart'
import type { MarkerEntity, CustomMarkerEntity } from '@/core/marker/registry'

/** 标记 hover 事件数据 */

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
     * 处理滚轮缩放事件（缩放逻辑由 Vue 层驱动，此处仅清除交互状态）
     */
    onWheel(_e: WheelEvent) {
        this.clearHover()
        this.notifyInteractionChange()
    }

    /**
     * [触屏]:处理 Pointer 按下事件
     * @param e PointerEvent
     */
    onPointerDown(e: PointerEvent) {
        //1. 只处理主指针，避免多指触控状态混乱
        if (e.isPrimary === false) return

        //2. 标记触摸会话
        this.isTouchSession = e.pointerType === 'touch'

        const container = this.chart.getDom().container
        const rect = container.getBoundingClientRect()
        const mouseX = e.clientX - rect.left
        const mouseY = e.clientY - rect.top
        const scrollLeft = container.scrollLeft

        //3. 优先检查 marker 点击
        const markerManager = this.chart.getMarkerManager()
        const worldX = scrollLeft + mouseX
        const hitMarker = markerManager.hitTest(worldX, mouseY, 3)

        if (hitMarker) {
            // 点击了 marker，记录并触发回调
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

        //3.5 确定鼠标落在哪个 pane
        const paneRenderers = this.chart.getPaneRenderers()
        const renderer = paneRenderers.find((r) => {
            const pane = r.getPane()
            return mouseY >= pane.top && mouseY <= pane.top + pane.height
        })
        const pane = renderer?.getPane() || null

        const viewport = this.chart.getViewport()
        const plotWidth = viewport?.plotWidth ?? Math.max(1, Math.round(container.clientWidth))
        const isOnRightAxis = mouseX >= plotWidth
        if (isOnRightAxis && pane) {
            this.isDragging = true
            this.dragMode = 'scale-price'
            this.dragStartY = e.clientY
            this.activePaneIdOnDrag = pane.id
            this.updateHoverFromPoint(e.clientX, e.clientY)
            this.chart.scheduleDraw()
            return
        }

        //4. 没有点击 marker，开始拖拽
        this.isDragging = true
        this.dragMode = 'pan'
        this.updateHoverFromPoint(e.clientX, e.clientY)
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

    /**
     * 处理鼠标按下事件
     * @param e MouseEvent
     */
    onMouseDown(e: MouseEvent) {
        // 1. 触摸会话中忽略模拟的 mouse 事件
        if (this.isTouchSession) return
        if (e.button !== 0) return

        const container = this.chart.getDom().container
        const rect = container.getBoundingClientRect()
        const mouseX = e.clientX - rect.left
        const mouseY = e.clientY - rect.top
        const scrollLeft = container.scrollLeft

        // 2. 优先检查 marker 点击
        const markerManager = this.chart.getMarkerManager()
        const worldX = scrollLeft + mouseX
        const hitMarker = markerManager.hitTest(worldX, mouseY, 3)

        if (hitMarker) {
            // 点击了 marker，记录并触发回调
            this.clickedMarkerId = hitMarker.id
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
            e.preventDefault()
            return
        }

        // 3. 确定鼠标落在哪个 pane
        const paneRenderers = this.chart.getPaneRenderers()
        const renderer = paneRenderers.find((r) => {
            const pane = r.getPane()
            return mouseY >= pane.top && mouseY <= pane.top + pane.height
        })
        const pane = renderer?.getPane() || null

        const viewport = this.chart.getViewport()
        const plotWidth = viewport?.plotWidth ?? Math.max(1, Math.round(container.clientWidth))
        const isOnRightAxis = mouseX >= plotWidth
        if (isOnRightAxis && pane) {
            this.isDragging = true
            this.dragMode = 'scale-price'
            this.dragStartY = e.clientY
            this.activePaneIdOnDrag = pane.id
            this.updateHoverFromPoint(e.clientX, e.clientY)
            this.chart.scheduleDraw()
            e.preventDefault()
            return
        }

        // 4. 没有点击 marker，开始拖拽
        this.isDragging = true
        this.dragMode = 'pan'
        this.dragStartX = e.clientX
        this.dragStartY = e.clientY
        this.scrollStartX = container.scrollLeft
        this.activePaneIdOnDrag = pane?.id || null
        this.updateHoverFromPoint(e.clientX, e.clientY)
        this.chart.scheduleDraw()
        e.preventDefault()
    }

    /**
     * 处理鼠标移动事件
     * @param e MouseEvent
     */
    onMouseMove(e: MouseEvent) {
        if (this.isTouchSession) return
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
                // 1. 水平拖拽：更新滚动位置
                const deltaX = this.dragStartX - e.clientX
                container.scrollLeft = this.scrollStartX + deltaX

                // 2. 仅主图支持上下拖动平移价格轴
                const deltaY = e.clientY - this.dragStartY
                if (deltaY !== 0 && this.activePaneIdOnDrag === 'main') {
                    this.chart.translatePrice(this.activePaneIdOnDrag, deltaY)
                    this.dragStartY = e.clientY
                }
            }
            return
        }

        const rect = container.getBoundingClientRect()
        const mouseY = e.clientY - rect.top
        this.hoveredSeparatorUpperPaneId = this.hitTestPaneSeparator(mouseY)

        this.updateHoverFromPoint(e.clientX, e.clientY)
        this.chart.scheduleDraw()
        this.notifyInteractionChange()
    }

    /** 处理鼠标抬起事件 */
    onMouseUp() {
        if (this.isTouchSession) return
        this.isDragging = false
        this.dragMode = 'none'
        this.activePaneIdOnDrag = null
        this.activeSeparatorUpperPaneId = null
        this.notifyInteractionChange()
    }

    /** 处理鼠标离开事件 */
    onMouseLeave() {
        if (this.isTouchSession) return
        this.isDragging = false
        this.dragMode = 'none'
        this.activePaneIdOnDrag = null
        this.clearSeparatorState()
        this.clearHover()
        this.chart.scheduleDraw()
        this.notifyInteractionChange()
    }

    /** 处理滚动事件 */
    onScroll() {
        // 1. 清空 kLinePositions 和 visibleRange，避免使用过期数据
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
        // 只处理主指针
        if (!e.isPrimary) return

        // 触屏会话标记
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
                // 1. 水平拖拽：更新滚动位置
                const deltaX = this.dragStartX - e.clientX
                container.scrollLeft = this.scrollStartX + deltaX

                // 2. 仅主图支持上下拖动平移价格轴
                const deltaY = e.clientY - this.dragStartY
                if (deltaY !== 0 && this.activePaneIdOnDrag === 'main') {
                    this.chart.translatePrice(this.activePaneIdOnDrag, deltaY)
                    this.dragStartY = e.clientY
                }
            }
            return
        }

        const rect = container.getBoundingClientRect()
        const mouseY = e.clientY - rect.top
        this.hoveredSeparatorUpperPaneId = this.hitTestPaneSeparator(mouseY)

        this.updateHoverFromPoint(e.clientX, e.clientY)
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

    /** 检查是否正在拖拽 */
    isDraggingState(): boolean {
        return this.isDragging
    }

    /** 是否处于分隔线拖拽状态 */
    isResizingPaneBoundaryState(): boolean {
        return this.dragMode === 'resize-separator'
    }

    /** 是否悬停在可拖拽分隔线上 */
    isHoveringPaneBoundaryState(): boolean {
        return this.hoveredSeparatorUpperPaneId !== null
    }

    /** 是否悬停在右轴区域 */
    isHoveringRightAxisState(): boolean {
        return this.hoveredRightAxisPaneId !== null
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

    /** 清除 hover 状态 */
    private clearHover() {
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
    private updateHoverFromPoint(clientX: number, clientY: number) {
        const container = this.chart.getDom().container
        const rect = container.getBoundingClientRect()
        const mouseX = clientX - rect.left
        const mouseY = clientY - rect.top
        const viewport = this.chart.getViewport()
        const viewWidth = viewport?.viewWidth ?? Math.max(1, Math.round(container.clientWidth))
        const viewHeight = viewport?.viewHeight ?? Math.max(1, Math.round(container.clientHeight))
        const plotWidth = viewport?.plotWidth ?? viewWidth
        const plotHeight = viewport?.plotHeight ?? viewHeight
        if (mouseX < 0 || mouseY < 0 || mouseY > plotHeight) {
            this.clearHover()
            this.hoveredRightAxisPaneId = null
            return
        }

        // 检测是否悬浮在右轴区域
        const isOnRightAxis = mouseX >= plotWidth
        if (isOnRightAxis) {
            // 确定鼠标落在哪个 pane
            const paneRenderers = this.chart.getPaneRenderers()
            const renderer = paneRenderers.find((r) => {
                const pane = r.getPane()
                return mouseY >= pane.top && mouseY <= pane.top + pane.height
            })
            const pane = renderer?.getPane() || null
            this.hoveredRightAxisPaneId = pane?.id || null
            // 右轴悬浮时不显示十字线
            this.crosshairPos = null
            this.crosshairIndex = null
            this.hoveredIndex = null
            return
        } else {
            this.hoveredRightAxisPaneId = null
        }

        const scrollLeft = container.scrollLeft
        const dpr = this.chart.getCurrentDpr()

        const separatorUpperPaneId = this.hitTestPaneSeparator(mouseY)
        this.hoveredSeparatorUpperPaneId = separatorUpperPaneId
        if (separatorUpperPaneId) {
            this.clearHover()
            return
        }

        // 2. 优先检查量价关系 marker 命中（marker 在 world 坐标系）
        const markerManager = this.chart.getMarkerManager()
        const worldX = scrollLeft + mouseX
        const hitMarker = markerManager.hitTest(worldX, mouseY, 3)

        if (hitMarker) {
            // 命中 marker，更新 hover 状态
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
            // marker hover 时不显示十字线和 K 线 tooltip
            this.crosshairPos = null
            this.crosshairIndex = null
            this.crosshairPrice = null
            this.hoveredIndex = null
            return
        } else {
            // 没有命中 marker，清除 marker hover 状态
            if (this.hoveredMarkerId !== null) {
                this.hoveredMarkerId = null
                this.hoveredMarkerData = null
                markerManager.setHover(null)
                if (this.onMarkerHoverCallback) {
                    this.onMarkerHoverCallback(null)
                }
            }
        }

        // 3. 检查自定义标记命中（屏幕坐标）
        const hitCustomMarker = markerManager.hitTestCustomMarker(mouseX, mouseY)
        if (hitCustomMarker) {
            // 命中自定义标记，更新 hover 状态
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
            // marker hover 时不显示十字线和 K 线 tooltip
            this.crosshairPos = null
            this.crosshairIndex = null
            this.crosshairPrice = null
            this.hoveredIndex = null
            return
        } else {
            // 没有命中自定义标记，清除 hover 状态
            if (this.hoveredCustomMarker !== null) {
                this.hoveredCustomMarker = null
                if (this.onCustomMarkerHoverCallback) {
                    this.onCustomMarkerHoverCallback(null)
                }
            }
        }

        // 4. kLinePositions 未就绪时不显示十字线
        if (!this.kLinePositions || !this.visibleRange || !this.kWidthPx) {
            this.clearHover()
            return
        }

        // 4. 通过二分查找从 kLinePositions 反查 idx
        const kWidthLogical = this.kWidthPx / dpr

        // 二分查找：找到 worldX 对应的 K 线索引
        let lo = 0, hi = this.kLinePositions.length
        while (lo < hi) {
            const mid = (lo + hi) >> 1
            if (this.kLinePositions[mid]! < worldX) {
                lo = mid + 1
            } else {
                hi = mid
            }
        }

        // 确定最终 localIdx：比较左右两个位置的 K 线中心，选更近的
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

        // 5. 确定鼠标落在哪个 pane
        const paneRenderers = this.chart.getPaneRenderers()
        const renderer = paneRenderers.find((r) => {
            const pane = r.getPane()
            return mouseY >= pane.top && mouseY <= pane.top + pane.height
        })
        const pane = renderer?.getPane() || null
        this.activePaneId = pane?.id || null

        // 6. 计算十字线位置（统一使用 kLinePositions）
        if (idx >= 0 && idx < (data?.length ?? 0)) {
            this.crosshairIndex = idx

            const kLineStartX = this.kLinePositions[localIdx]!
            const snappedX = kLineStartX + (this.kWidthPx - 1) / 2 / dpr - scrollLeft

            this.crosshairPos = {
                x: Math.min(Math.max(snappedX, 0), plotWidth),
                y: Math.min(Math.max(mouseY, 0), plotHeight),
            }

            // 计算十字线指向的价格（用于价格轴平移时跟随）
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

        // 7. Tooltip 命中判定
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

        // 7.1 使用 kLinePositions 计算在当前 K 线单元内的相对 X 位置
        const kLineStartX = this.kLinePositions[localIdx]!
        const inUnitX = worldX - kLineStartX
        const cxLogical = kWidthLogical / 2

        // 7.2 扩大 hitBody 的 Y 方向判定范围
        const MIN_BODY_HIT_HEIGHT = 8
        const bodyHeight = Math.abs(bodyBottom - bodyTop)
        const effectiveBodyTop = bodyHeight < MIN_BODY_HIT_HEIGHT ? (bodyTop + bodyBottom) / 2 - MIN_BODY_HIT_HEIGHT / 2 : bodyTop
        const effectiveBodyBottom = bodyHeight < MIN_BODY_HIT_HEIGHT ? (bodyTop + bodyBottom) / 2 + MIN_BODY_HIT_HEIGHT / 2 : bodyBottom

        // 7.3 扩大 hitWick 的 X 方向判定范围
        const HIT_WICK_HALF_EXTENDED = 3

        const hitBody = localY >= effectiveBodyTop && localY <= effectiveBodyBottom &&
            inUnitX >= 0 && inUnitX <= kWidthLogical
        const hitWick = Math.abs(inUnitX - cxLogical) <= HIT_WICK_HALF_EXTENDED &&
            localY >= highY && localY <= lowY

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

        // 7.4 tooltip 防溢出定位
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
