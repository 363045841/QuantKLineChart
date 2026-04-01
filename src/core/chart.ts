import type { KLineData } from '@/types/price'
import { getVisibleRange } from '@/core/viewport/viewport'
import { Pane, type VisibleRange } from '@/core/layout/pane'
import { InteractionController } from '@/core/controller/interaction'
import { PaneRenderer } from '@/core/paneRenderer'
import { drawTimeAxisLayer } from '@/core/renderers/timeAxis'
import { drawCrosshair } from '@/core/renderers/crosshair'
import { drawMALegend } from '@/core/renderers/maLegend'
import { drawAllPanesBorders } from '@/core/renderers/globalBorders'
import { tagLog, tagLogThrottle } from '@/utils/logger'
import { MarkerManager } from './marker/registry'
import { getPhysicalKLineConfig, calcKWidthPx } from '@/core/utils/klineConfig'

// 重新导出以保持向后兼容
export { getPhysicalKLineConfig, calcKWidthPx }

/**
 * 图表 DOM 元素引用
 * @property container 图表容器 div
 * @property canvasLayer Canvas 层容器 div（包含所有绘制 canvas）
 * @property xAxisCanvas X 轴时间轴 canvas
 * @property borderCanvas 全局边框 canvas（可选，由 Chart 内部创建）
 */
export type ChartDom = {
    container: HTMLDivElement
    canvasLayer: HTMLDivElement
    xAxisCanvas: HTMLCanvasElement
    borderCanvas?: HTMLCanvasElement
}

/**
 * Pane 面板配置
 * @property id Pane 标识符
 * @property ratio Pane 高度占比
 */
export type PaneSpec = { id: string; ratio: number }

export type PaneRendererDom = {
    plotCanvas: HTMLCanvasElement
    yAxisCanvas: HTMLCanvasElement
}

export type ChartOptions = {
    kWidth: number
    kGap: number
    yPaddingPx: number
    rightAxisWidth: number
    bottomAxisHeight: number
    minKWidth: number
    maxKWidth: number
    panes: PaneSpec[]

    /** pane 之间的真实分隔空隙（逻辑像素） */
    paneGap?: number

    /** 价格标签额外宽度（用于显示涨跌幅，默认 60px） */
    priceLabelWidth?: number
}

/** K 线起始 x 坐标数组，positions[i] 表示第 i 根 K 线的起始 x 坐标（逻辑像素） */
export type KLinePositions = number[]

export type Viewport = {
    viewWidth: number
    viewHeight: number
    plotWidth: number
    plotHeight: number
    scrollLeft: number
    dpr: number
}

export class Chart {
    private dom: ChartDom
    private opt: ChartOptions
    private data: KLineData[] = []

    private raf: number | null = null
    private viewport: Viewport | null = null

    private paneRenderers: PaneRenderer[] = []
    private markerManager: MarkerManager
    readonly interaction: InteractionController

    /**
     * 创建图表实例
     * @param dom 由 Vue 组件传入的 DOM 句柄
     * @param opt 初始配置
     */
    constructor(dom: ChartDom, opt: ChartOptions) {
        this.dom = dom
        this.opt = opt
        this.interaction = new InteractionController(this)
        this.markerManager = new MarkerManager()

        this.initPanes()
    }

    /** 绘制一帧 */
    draw() {
        // 重置 Marker 标记
        this.markerManager.clear()

        // 1. 计算视口信息
        const vp = this.computeViewport()
        if (!vp) return

        // 2. 获取 xAxis Canvas 上下文
        const xAxisCtx = this.dom.xAxisCanvas.getContext('2d')
        if (!xAxisCtx) return

        // 3. 清空 xAxis Canvas 并设置 DPR 缩放
        xAxisCtx.setTransform(1, 0, 0, 1, 0, 0)
        xAxisCtx.scale(vp.dpr, vp.dpr)
        xAxisCtx.clearRect(0, 0, vp.plotWidth, this.opt.bottomAxisHeight)

        // 4. 计算可视 K 线数据范围（使用物理像素对齐）
        let { start, end } = getVisibleRange(
            vp.scrollLeft,
            vp.plotWidth,
            this.opt.kWidth,
            this.opt.kGap,
            this.data.length,
            vp.dpr
        )

        const range: VisibleRange = { start, end }

        // 4.1 计算 K 线起始 x 坐标数组, 作为统一坐标源
        const kLinePositions = this.calcKLinePositions(range)

        // 4.2 设置 K 线坐标数组到交互控制器（传递 kWidthPx 用于计算 K 线中心）
        const { kWidthPx } = getPhysicalKLineConfig(this.opt.kWidth, this.opt.kGap, vp.dpr)
        this.interaction.setKLinePositions(kLinePositions, range, kWidthPx)

        // 5. 遍历所有 PaneRenderer 独立绘制每个 pane
        const isDragging = this.interaction.isDraggingState()
        for (const renderer of this.paneRenderers) {
            renderer.draw({
                data: this.data,
                range,
                scrollLeft: vp.scrollLeft,
                kWidth: this.opt.kWidth,
                kGap: this.opt.kGap,
                dpr: vp.dpr,
                crosshairPos: isDragging ? null : this.interaction.crosshairPos,
                crosshairIndex: isDragging ? null : this.interaction.crosshairIndex,
                title: renderer.getPane().id === 'sub' ? 'VOL - 成交量' : undefined,
                kLinePositions,
                markerManager: this.markerManager,
            })
        }

        // 6. 绘制 xAxis 时间轴
        drawTimeAxisLayer({
            ctx: xAxisCtx,
            data: this.data,
            scrollLeft: vp.scrollLeft,
            kWidth: this.opt.kWidth,
            kGap: this.opt.kGap,
            startIndex: range.start,
            endIndex: range.end,
            dpr: vp.dpr,
            crosshair:
                !isDragging && this.interaction.crosshairPos && typeof this.interaction.crosshairIndex === 'number'
                    ? { x: this.interaction.crosshairPos.x, index: this.interaction.crosshairIndex }
                    : null,
        })

        // 7. 绘制十字线（垂直线在所有 pane 上绘制，水平线只在活跃 pane 上绘制）
        if (!isDragging && this.interaction.crosshairPos) {
            const { x, y } = this.interaction.crosshairPos
            const activePaneId = this.interaction.activePaneId

            for (const renderer of this.paneRenderers) {
                const pane = renderer.getPane()
                const plotCtx = renderer.getDom().plotCanvas.getContext('2d')
                if (!plotCtx) continue

                const isActive = pane.id === activePaneId
                const localY = isActive ? y - pane.top : 0

                plotCtx.save()
                drawCrosshair({
                    ctx: plotCtx,
                    plotWidth: vp.plotWidth,
                    plotHeight: pane.height,
                    dpr: vp.dpr,
                    x,
                    y: localY,
                    drawVertical: true,
                    drawHorizontal: isActive,
                })
                plotCtx.restore()
            }
        }

        // 8. 绘制 MA 图例
        const mainRenderer = this.paneRenderers.find((r) => r.getPane().id === 'main')
        if (mainRenderer) {
            const plotCtx = mainRenderer.getDom().plotCanvas.getContext('2d')
            if (plotCtx) {
                drawMALegend({
                    ctx: plotCtx,
                    data: this.data,
                    yPaddingPx: this.opt.yPaddingPx,
                    endIndex: range.end,
                    showMA: { ma5: true, ma10: true, ma20: true, ma30: true, ma60: true },
                    dpr: vp.dpr,
                })
            }
        }

        // 9. 绘制全局边框
        const borderCanvas = this.dom.borderCanvas
        if (!borderCanvas) return
        const borderCtx = borderCanvas.getContext('2d')
        if (!borderCtx) return

        borderCtx.setTransform(1, 0, 0, 1, 0, 0)
        borderCtx.scale(vp.dpr, vp.dpr)
        borderCtx.clearRect(0, 0, vp.plotWidth, vp.plotHeight)

        drawAllPanesBorders({
            ctx: borderCtx,
            dpr: vp.dpr,
            plotWidth: vp.plotWidth,
            panes: this.paneRenderers.map(r => ({
                top: r.getPane().top,
                height: r.getPane().height
            }))
        })
    }

    /**
     * 以鼠标位置为中心缩放 K 线，保持鼠标指向的 K 线位置不变
     * @param mouseX 鼠标相对 container 左侧的 x 坐标
     * @param scrollLeft 当前 container 的 scrollLeft
     * @param deltaY 滚动方向（大于 0 缩小，小于 0 放大）
     */
    zoomAt(mouseX: number, scrollLeft: number, deltaY: number) {
        // 1. 记录缩放中心点（鼠标指向的 K 线索引）
        const oldUnit = this.opt.kWidth + this.opt.kGap
        const centerIndex = (scrollLeft + mouseX) / oldUnit

        // 2. 物理像素空间调整 kWidth（步进 2 保证实体可被影线居中等分）
        const dpr = this.viewport?.dpr || window.devicePixelRatio || 1
        const physKWidth = Math.round(this.opt.kWidth * dpr)
        const delta = deltaY > 0 ? -2 : 2
        let newPhysKWidth = physKWidth + delta
        if (newPhysKWidth % 2 === 0) {
            newPhysKWidth += delta > 0 ? 1 : -1
        }

        // 3. 转回逻辑像素，同步更新 kGap（物理固定 3px）
        let newKWidth = newPhysKWidth / dpr
        const PHYS_K_GAP = 3
        const newKGap = PHYS_K_GAP / dpr

        // 4. 限制在 kWidth 范围内，无变化则直接返回
        newKWidth = Math.max(this.opt.minKWidth, Math.min(this.opt.maxKWidth, newKWidth))
        if (Math.abs(newKWidth - this.opt.kWidth) < 0.01) return

        this.opt = { ...this.opt, kWidth: newKWidth, kGap: newKGap }

        // 5. 校正滚动位置，使缩放后鼠标仍指向同一根 K 线
        const newUnit = newKWidth + newKGap
        const newScrollLeft = centerIndex * newUnit - mouseX

        if (this.onZoomChange) {
            this.onZoomChange(newKWidth, newKGap, newScrollLeft)
            return
        }

        // 6. 更新 DOM 并触发重绘
        const container = this.dom.container
        const maxScrollLeft = Math.max(0, container.scrollWidth - container.clientWidth)
        container.scrollLeft = Math.min(Math.max(0, newScrollLeft), maxScrollLeft)
        this.scheduleDraw()
    }


    /** 缩放回调函数，用于通知外部同步 kWidth、kGap 与 scrollLeft */
    private onZoomChange?: (kWidth: number, kGap: number, targetScrollLeft: number) => void

    /**
     * 注册缩放回调函数
     * @param cb 缩放回调函数
     */
    setOnZoomChange(cb: (kWidth: number, kGap: number, targetScrollLeft: number) => void) {
        this.onZoomChange = cb
    }


    /** 获取所有 PaneRenderer */
    getPaneRenderers(): PaneRenderer[] {
        return this.paneRenderers
    }

    /** 获取 MarkerManager（供 InteractionController 使用） */
    getMarkerManager(): MarkerManager {
        return this.markerManager
    }

    /**
     * 设置指定 pane 的渲染器链
     * @param paneId pane 标识（如 'main' 或 'sub'）
     * @param renderers 渲染器数组
     */
    setPaneRenderers(paneId: string, renderers: Pane['renderers']) {
        const renderer = this.paneRenderers.find((r) => r.getPane().id === paneId)
        if (!renderer) return
        const pane = renderer.getPane()
        // 1. 清空并替换渲染器（保持引用稳定）
        pane.renderers.length = 0
        for (const r of renderers) pane.renderers.push(r)
        this.scheduleDraw()
    }

    /** 获取 ChartDom（供 InteractionController 使用） */
    getDom() {
        return this.dom
    }

    /** 获取当前 ChartOptions（返回内部当前快照） */
    getOption() {
        return this.opt
    }

    /**
     * 计算 K 线起始 x 坐标数组，与 candle.ts 的像素对齐方式保持一致
     * @param range 可见 K 线索引范围
     * @returns x 坐标数组（逻辑像素，经过物理像素对齐）
     */
    calcKLinePositions(range: VisibleRange): KLinePositions {
        const { start, end } = range
        const count = end - start
        const dpr = this.viewport?.dpr || window.devicePixelRatio || 1

        // 统一使用 getPhysicalKLineConfig，确保与渲染完全一致
        const { unitPx, startXPx } = getPhysicalKLineConfig(this.opt.kWidth, this.opt.kGap, dpr)

        const positions: number[] = new Array(count)

        for (let i = 0; i < count; i++) {
            const dataIndex = start + i
            const leftPx = startXPx + dataIndex * unitPx
            positions[i] = leftPx / dpr
        }

        return positions
    }

    /**
     * 获取 K 线渲染使用的物理像素配置，确保渲染器和交互逻辑使用一致的坐标计算
     * @returns 物理像素配置对象
     */
    getKLinePhysicalConfig() {
        const dpr = this.viewport?.dpr || window.devicePixelRatio || 1
        return getPhysicalKLineConfig(this.opt.kWidth, this.opt.kGap, dpr)
    }

    /**
     * 更新配置并触发布局/重绘
     * @param partial 部分配置项
     */
    updateOptions(partial: Partial<ChartOptions>) {
        this.opt = { ...this.opt, ...partial }
        // 1. panes 变化需要重建布局
        if (partial.panes) this.initPanes()
        this.resize()
    }

    /**
     * 更新数据并请求重绘
     * @param data K 线数据数组
     */
    updateData(data: KLineData[]) {
        this.data = data ?? []
        this.scheduleDraw()
    }

    /** 获取当前数据源（供 renderers 和 interaction 使用） */
    getData(): KLineData[] {
        return this.data
    }

    /** 获取内容总宽度（用于外部 scroll-content 撑开 scrollWidth） */
    getContentWidth(): number {
        const n = this.data?.length ?? 0
        const dpr = this.viewport?.dpr || window.devicePixelRatio || 1

        // 使用物理像素对齐后的配置，确保与渲染一致
        const { startXPx, unitPx } = getPhysicalKLineConfig(this.opt.kWidth, this.opt.kGap, dpr)

        // 实际需要的 plot 宽度（物理像素转回逻辑像素）
        const plotWidth = (startXPx + n * unitPx) / dpr
        const yAxisTotalWidth = this.opt.rightAxisWidth + (this.opt.priceLabelWidth || 60)
        return plotWidth + yAxisTotalWidth
    }

    /** 容器尺寸变化时调用 */
    resize() {
        this.computeViewport()
        this.layoutPanes()
        this.scheduleDraw()
    }

    /** 请求下一帧重绘（RAF 合并） */
    scheduleDraw() {
        if (this.raf != null) cancelAnimationFrame(this.raf)
        this.raf = requestAnimationFrame(() => {
            this.raf = null
            this.draw()
        })
    }



    /** 销毁图表实例 */
    destroy() {
        if (this.raf != null) cancelAnimationFrame(this.raf)
        this.raf = null
        this.viewport = null
        this.paneRenderers.forEach((r) => r.destroy())
        this.paneRenderers = []
        this.onZoomChange = undefined
    }

    /** 初始化所有 pane */
    private initPanes() {
        this.paneRenderers = this.opt.panes.map((spec, index) => {
            const pane = new Pane(spec.id)

            const plotCanvas = document.createElement('canvas')
            const yAxisCanvas = document.createElement('canvas')

            plotCanvas.id = `${spec.id}-plot`
            yAxisCanvas.id = `${spec.id}-yAxis`

            plotCanvas.style.position = 'absolute'
            plotCanvas.style.left = '0'
            plotCanvas.style.top = '0'

            yAxisCanvas.style.position = 'absolute'
            yAxisCanvas.style.top = '0'
            yAxisCanvas.style.left = '0'

            const renderer = new PaneRenderer(
                { plotCanvas, yAxisCanvas },
                pane,
                {
                    rightAxisWidth: this.opt.rightAxisWidth,
                    yPaddingPx: this.opt.yPaddingPx,
                    priceLabelWidth: this.opt.priceLabelWidth,
                    isLast: index === this.opt.panes.length - 1,
                }
            )

            return renderer
        })

        const canvasLayer = this.dom.canvasLayer
        if (canvasLayer) {
            const existingCanvases = canvasLayer.querySelectorAll('canvas:not(.x-axis-canvas)')
            existingCanvases.forEach((canvas) => canvas.remove())

            this.paneRenderers.forEach((renderer) => {
                const dom = renderer.getDom()
                canvasLayer.appendChild(dom.plotCanvas)
                canvasLayer.appendChild(dom.yAxisCanvas)
            })

            const borderCanvas = document.createElement('canvas')
            borderCanvas.id = 'border'
            borderCanvas.style.position = 'absolute'
            borderCanvas.style.left = '0'
            borderCanvas.style.top = '0'
            borderCanvas.style.pointerEvents = 'none'
            this.dom.borderCanvas = borderCanvas
            canvasLayer.appendChild(borderCanvas)
        }
    }

    /** 计算每个 pane 的布局（top 和 height） */
    private layoutPanes() {
        const vp = this.viewport
        if (!vp) return

        const totalRatio = this.opt.panes.reduce((s, p) => s + (p.ratio ?? 0), 0) || 1
        const gap = Math.max(0, this.opt.paneGap ?? 0)
        let y = 0

        const n = Math.min(this.paneRenderers.length, this.opt.panes.length)
        const totalGaps = gap * Math.max(0, n - 1)
        const availableH = Math.max(1, vp.plotHeight - totalGaps)
        for (let i = 0; i < n; i++) {
            const spec = this.opt.panes[i]
            const renderer = this.paneRenderers[i]
            if (!spec || !renderer) continue

            const pane = renderer.getPane()
            const h = i === n - 1 ? availableH - y : Math.round(availableH * (spec.ratio / totalRatio))

            pane.setLayout(y, h)
            // 1. 副图不设置 padding，主图使用配置的 yPaddingPx
            if (pane.id === 'sub') {
                pane.setPadding(0, 0)
            } else {
                pane.setPadding(this.opt.yPaddingPx, this.opt.yPaddingPx)
            }

            renderer.resize(vp.plotWidth, h, vp.dpr)
            const dom = renderer.getDom()
            dom.plotCanvas.style.top = `${y}px`
            dom.yAxisCanvas.style.top = `${y}px`
            dom.yAxisCanvas.style.left = `${Math.floor(vp.plotWidth)}px`

            y += h + gap
        }
    }

    /** 计算并应用 viewport */
    private computeViewport(): Viewport | null {
        const container = this.dom.container
        if (!container) return null

        const rect = container.getBoundingClientRect()
        const viewWidth = Math.max(1, Math.ceil(rect.width))
        const viewHeight = Math.max(1, Math.ceil(rect.height))
        const scrollLeft = container.scrollLeft

        const yAxisTotalWidth = this.opt.rightAxisWidth + (this.opt.priceLabelWidth || 60)
        const plotWidth = Math.round(viewWidth - yAxisTotalWidth)
        const plotHeight = Math.round(viewHeight - this.opt.bottomAxisHeight)

        let dpr = window.devicePixelRatio || 1
        const MAX_CANVAS_PIXELS = 16 * 1024 * 1024
        const requestedPixels = viewWidth * dpr * (viewHeight * dpr)
        if (requestedPixels > MAX_CANVAS_PIXELS) {
            dpr = Math.sqrt(MAX_CANVAS_PIXELS / (viewWidth * viewHeight))
        }

        this.dom.canvasLayer.style.width = `${viewWidth}px`
        this.dom.canvasLayer.style.height = `${viewHeight}px`

        this.dom.xAxisCanvas.style.width = `${plotWidth}px`
        this.dom.xAxisCanvas.style.height = `${this.opt.bottomAxisHeight}px`
        this.dom.xAxisCanvas.style.top = `${Math.floor(plotHeight)}px`
        this.dom.xAxisCanvas.width = Math.round(plotWidth * dpr)
        this.dom.xAxisCanvas.height = Math.round(this.opt.bottomAxisHeight * dpr)

        if (this.dom.borderCanvas) {
            this.dom.borderCanvas.style.width = `${plotWidth}px`
            this.dom.borderCanvas.style.height = `${plotHeight}px`
            this.dom.borderCanvas.width = Math.ceil(plotWidth * dpr)
            this.dom.borderCanvas.height = Math.ceil(plotHeight * dpr)
        }

        const vp: Viewport = {
            viewWidth,
            viewHeight,
            plotWidth,
            plotHeight,
            scrollLeft,
            dpr,
        }
        this.viewport = vp
        return vp
    }
}