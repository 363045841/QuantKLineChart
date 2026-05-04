import type { KLineData } from '@/types/price'
import { getVisibleRange } from '@/core/viewport/viewport'
import { Pane, type VisibleRange } from '@/core/layout/pane'
import { InteractionController } from '@/core/controller/interaction'
import { PaneRenderer } from '@/core/paneRenderer'
import { MarkerManager, type CustomMarkerEntity } from './marker/registry'
import { getPhysicalKLineConfig, calcKWidthPx } from '@/core/utils/klineConfig'
import {
    createPluginHost,
    type PluginHostImpl,
    RendererPluginManager,
    type RendererPlugin,
    type RendererPluginWithHost,
    type RenderContext,
    wrapPaneInfo,
} from '@/plugin'
import { createSubIndicatorRenderer, type SubIndicatorType } from '@/core/renderers/Indicator'

// 重新导出以保持向后兼容
export { getPhysicalKLineConfig, calcKWidthPx }

/**
 * 图表 DOM 元素引用
 * @property container 图表容器 div
 * @property canvasLayer Canvas 层容器 div（包含所有绘制 canvas）
 * @property xAxisCanvas X 轴时间轴 canvas
 */
export type ChartDom = {
    container: HTMLDivElement
    canvasLayer: HTMLDivElement
    xAxisCanvas: HTMLCanvasElement
}

/**
 * Pane 面板配置
 * @property id Pane 标识符
 * @property ratio Pane 高度占比
 * @property visible 是否可见（默认 true）
 */
export type PaneSpec = { id: string; ratio: number; visible?: boolean; minHeightPx?: number }

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

    /** pane 最小高度（逻辑像素，默认 60） */
    defaultPaneMinHeightPx?: number
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

    /** 插件宿主 */
    private pluginHost: PluginHostImpl

    /** 渲染器插件管理器 */
    private rendererPluginManager: RendererPluginManager

    /** 精确 DPR（来自 ResizeObserver 的 devicePixelContentBoxSize） */
    private preciseDpr = 0

    /** 统一监听容器尺寸与 DPR 变化 */
    private resizeObserver?: ResizeObserver

    /** 最近一次观测到的容器尺寸 */
    private observedSize = { width: 0, height: 0 }

    /** pane ratio 状态（按 paneId 维护，sum=1 仅对可见 pane） */
    private paneRatios: Map<string, number> = new Map()

    /** 视口变化回调（供外部同步 DPR/尺寸） */
    private onViewportChange?: (viewport: Viewport) => void

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
        this.pluginHost = createPluginHost()
        this.rendererPluginManager = new RendererPluginManager()

        // 注入依赖
        this.rendererPluginManager.setPluginHost(this.pluginHost)
        this.rendererPluginManager.setInvalidateCallback(() => this.scheduleDraw())

        this.syncPaneRatiosFromSpecs(this.opt.panes)
        this.initPanes()
        this.initResizeObserver()
    }


    private initResizeObserver() {
        if (typeof ResizeObserver === 'undefined') return

        const target = this.dom.container
        if (!target) return

        this.resizeObserver = new ResizeObserver((entries) => {
            const entry = entries[0]
            if (!entry) return

            const prevWidth = this.observedSize.width
            const prevHeight = this.observedSize.height
            const prevDpr = this.preciseDpr

            this.updateObservedMetrics(entry)

            const widthChanged = this.observedSize.width !== prevWidth
            const heightChanged = this.observedSize.height !== prevHeight
            const dprChanged = this.preciseDpr !== prevDpr
            if (widthChanged || heightChanged || dprChanged) {
                this.resize()
            }
        })

        try {
            this.resizeObserver.observe(target, { box: 'device-pixel-content-box' as ResizeObserverBoxOptions })
        } catch {
            this.resizeObserver.observe(target)
        }
    }



    private updateObservedMetrics(entry: ResizeObserverEntry) {
        const cssWidth = Math.max(1, Math.round(entry.contentRect.width))
        const cssHeight = Math.max(1, Math.round(entry.contentRect.height))
        this.observedSize.width = cssWidth
        this.observedSize.height = cssHeight

        const pixelSize = entry.devicePixelContentBoxSize?.[0]
        const cssSize = entry.contentBoxSize?.[0]
        if (!pixelSize || !cssSize || cssSize.inlineSize <= 0) {
            this.preciseDpr = 0
            return
        }

        const raw = pixelSize.inlineSize / cssSize.inlineSize
        this.preciseDpr = Math.round(raw * 64) / 64
    }

    private getEffectiveDpr(): number {
        let dpr = this.preciseDpr > 0
            ? this.preciseDpr
            : Math.round((window.devicePixelRatio || 1) * 64) / 64
        if (dpr < 1) dpr = 1
        return dpr
    }

    getViewport(): Viewport | null {
        return this.viewport
    }

    getCurrentDpr(): number {
        return this.getEffectiveDpr()
    }

    /** 获取插件宿主 */
    get plugin(): PluginHostImpl {
        return this.pluginHost
    }

    // ========== 渲染器插件 API ==========

    /** 安装渲染器插件 */
    useRenderer(plugin: RendererPlugin | RendererPluginWithHost, config?: Record<string, unknown>): void {
        this.rendererPluginManager.register(plugin)
        if (config && plugin.setConfig) {
            plugin.setConfig(config)
        }
    }

    /** 移除渲染器插件 */
    removeRenderer(name: string): void {
        this.rendererPluginManager.unregister(name)
    }

    /** 获取渲染器插件 */
    getRenderer<T extends RendererPlugin = RendererPlugin>(name: string): T | undefined {
        return this.rendererPluginManager.getPlugin<T>(name)
    }

    /** 更新渲染器配置（自动重绘） */
    updateRendererConfig(name: string, config: Record<string, unknown>): void {
        this.rendererPluginManager.updateConfig(name, config)
    }

    /** 启用/禁用渲染器 */
    setRendererEnabled(name: string, enabled: boolean): void {
        this.rendererPluginManager.setEnabled(name, enabled)
    }

    /** 获取所有渲染器 */
    getAllRenderers(): RendererPlugin[] {
        return this.rendererPluginManager.getAllPlugins()
    }

    /** 绘制一帧 */
    draw() {
        // 重置 Marker 标记
        this.markerManager.clear()

        // 1. 计算视口信息
        const vp = this.computeViewport()
        if (!vp) return

        // 数据为空时跳过渲染
        if (this.data.length === 0) return

        // 2. 计算可视 K 线数据范围
        const { start, end } = getVisibleRange(
            vp.scrollLeft,
            vp.plotWidth,
            this.opt.kWidth,
            this.opt.kGap,
            this.data.length,
            vp.dpr
        )

        const range: VisibleRange = { start, end }

        // 3. 计算 K 线坐标
        const kLinePositions = this.calcKLinePositions(range)

        // 4. 设置交互控制器
        const { kWidthPx } = getPhysicalKLineConfig(this.opt.kWidth, this.opt.kGap, vp.dpr)
        this.interaction.setKLinePositions(kLinePositions, range, kWidthPx)

        // 5. 遍历所有 Pane 渲染
        for (const renderer of this.paneRenderers) {
            const pane = renderer.getPane()
            const plotCtx = renderer.getDom().plotCanvas.getContext('2d')
            const yAxisCtx = renderer.getDom().yAxisCanvas.getContext('2d')

            // 更新价格范围
            pane.updateRange(this.data, range)

            // 清空 plotCanvas
            if (plotCtx) {
                plotCtx.setTransform(1, 0, 0, 1, 0, 0)
                plotCtx.scale(vp.dpr, vp.dpr)
                // 多清除 1px 避免右边界残留
                plotCtx.clearRect(0, 0, vp.plotWidth + 1, pane.height + 2 / vp.dpr)
            }

            // 清空 yAxisCanvas
            const yAxisWidth = this.opt.rightAxisWidth + (this.opt.priceLabelWidth || 60)
            if (yAxisCtx) {
                yAxisCtx.setTransform(1, 0, 0, 1, 0, 0)
                yAxisCtx.scale(vp.dpr, vp.dpr)
                yAxisCtx.clearRect(0, 0, yAxisWidth, pane.height + 2 / vp.dpr)
            }

            // 构建渲染上下文
            const context: RenderContext = {
                ctx: plotCtx!,
                pane: wrapPaneInfo(pane),
                data: this.data,
                range,
                scrollLeft: vp.scrollLeft,
                kWidth: this.opt.kWidth,
                kGap: this.opt.kGap,
                dpr: vp.dpr,
                paneWidth: vp.plotWidth,
                kLinePositions,
                markerManager: this.markerManager,
                yAxisCtx: yAxisCtx ?? undefined,
            }

            // 插件渲染器绘制
            if (plotCtx) {
                plotCtx.save()
                const errors = this.rendererPluginManager.render(pane.id, context)
                if (errors.length > 0) {
                    this.pluginHost.events.emit('renderer:error', { paneId: pane.id, errors })
                }
                plotCtx.restore()
            }
        }

        // 6. 渲染时间轴（通过插件管理器的特殊方法）
        const xAxisCtx = this.dom.xAxisCanvas.getContext('2d')
        if (xAxisCtx) {
            const timeAxisContext: RenderContext = {
                ctx: xAxisCtx,
                pane: { id: 'xAxis', top: 0, height: this.opt.bottomAxisHeight, yAxis: { priceToY: () => 0, yToPrice: () => 0, getPaddingTop: () => 0, getPaddingBottom: () => 0, getPriceOffset: () => 0 }, priceRange: { maxPrice: 0, minPrice: 0 } },
                data: this.data,
                range,
                scrollLeft: vp.scrollLeft,
                kWidth: this.opt.kWidth,
                kGap: this.opt.kGap,
                dpr: vp.dpr,
                paneWidth: vp.plotWidth,
                kLinePositions,
                xAxisCtx,
            }
            const errors = this.rendererPluginManager.renderPlugin('timeAxis', timeAxisContext)
            if (errors.length > 0) {
                this.pluginHost.events.emit('renderer:error', { paneId: 'timeAxis', errors })
            }
        }
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
        const dpr = this.getEffectiveDpr()
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

        // 5. 校正滚动位置，使缩放后鼠标仍指向同一根 K 线
        const newUnit = newKWidth + newKGap
        const newScrollLeft = centerIndex * newUnit - mouseX

        if (this.onZoomChange) {
            // ✅ 不在这里更新 this.opt，避免与 scrollLeft 更新不同步产生残影
            // 把新参数传给外部，等 scrollLeft 落地后再回调 applyZoom
            this.onZoomChange(newKWidth, newKGap, newScrollLeft)
            return
        }

        // 无外部回调时（独立使用场景）：同步更新 opt 和 scrollLeft
        this.opt = { ...this.opt, kWidth: newKWidth, kGap: newKGap }
        const container = this.dom.container
        const maxScrollLeft = Math.max(0, container.scrollWidth - container.clientWidth)
        container.scrollLeft = Math.min(Math.max(0, newScrollLeft), maxScrollLeft)
        this.scheduleDraw()
    }

    /**
     * 由外部（Vue 组件）在 scrollLeft 落地后调用，原子性地应用缩放参数
     * 确保 draw() 看到的 (kWidth, kGap, scrollLeft) 是一致的
     * @param kWidth 新的 K 线宽度
     * @param kGap 新的 K 线间隙
     */
    applyZoom(kWidth: number, kGap: number) {
        this.opt = { ...this.opt, kWidth, kGap }
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

    /** 注册视口变化回调 */
    setOnViewportChange(cb: (viewport: Viewport) => void) {
        this.onViewportChange = cb
    }

    /** 获取所有 PaneRenderer */
    getPaneRenderers(): PaneRenderer[] {
        return this.paneRenderers
    }

    /** 获取 MarkerManager（供 InteractionController 使用） */
    getMarkerManager(): MarkerManager {
        return this.markerManager
    }

    /** 更新自定义标记 */
    updateCustomMarkers(markers: CustomMarkerEntity[]): void {
        this.markerManager.setCustomMarkers(markers)
        this.scheduleDraw()
    }

    /** 清除自定义标记 */
    clearCustomMarkers(): void {
        this.markerManager.clearCustomMarkers()
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

        // 边界检查：防止负数或零长度数组
        if (count <= 0) {
            return []
        }

        const dpr = this.getEffectiveDpr()

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
     * 更新配置并触发布局/重绘
     * @param partial 部分配置项
     */
    updateOptions(partial: Partial<ChartOptions>) {
        this.opt = { ...this.opt, ...partial }
        // 1. panes 变化需要重建布局
        if (partial.panes) this.initPanes()
        this.resize()
    }

    /** 更新 pane 布局配置
     * @param panes 新的 pane 配置数组
     */
    updatePaneLayout(panes: PaneSpec[]): void {
        this.opt.panes = panes.map(spec => ({ ...spec }))
        this.syncPaneRatiosFromSpecs(this.opt.panes)
        this.layoutPanes()
        this.scheduleDraw()
    }

    /** 获取当前 pane 布局快照（含 ratio） */
    getPaneLayoutSpecs(): PaneSpec[] {
        const visible = this.opt.panes.filter(p => p.visible !== false)
        const sum = visible.reduce((s, p) => s + (this.paneRatios.get(p.id) ?? p.ratio ?? 0), 0)
        const safeSum = sum > 0 ? sum : 1
        return this.opt.panes.map((spec) => {
            const base = this.paneRatios.get(spec.id) ?? spec.ratio ?? 0
            const ratio = spec.visible === false ? base : base / safeSum
            return { ...spec, ratio }
        })
    }

    /**
     * 调整相邻 pane 边界（upper 与其下方一个 pane）
     * @param upperPaneId 上方 pane ID
     * @param deltaY Y 方向位移（逻辑像素，正数表示边界向下）
     */
    resizePaneBoundary(upperPaneId: string, deltaY: number): boolean {
        if (!Number.isFinite(deltaY) || deltaY === 0) return false
        const vp = this.viewport
        if (!vp) return false

        const visibleSpecs = this.opt.panes.filter(p => p.visible !== false)
        const upperIndex = visibleSpecs.findIndex(p => p.id === upperPaneId)
        if (upperIndex < 0 || upperIndex >= visibleSpecs.length - 1) return false

        const upperSpec = visibleSpecs[upperIndex]
        const lowerSpec = visibleSpecs[upperIndex + 1]
        if (!upperSpec || !lowerSpec) return false

        const upperRenderer = this.paneRenderers.find(r => r.getPane().id === upperSpec.id)
        const lowerRenderer = this.paneRenderers.find(r => r.getPane().id === lowerSpec.id)
        if (!upperRenderer || !lowerRenderer) return false

        const upperPane = upperRenderer.getPane()
        const lowerPane = lowerRenderer.getPane()
        const pairTotal = upperPane.height + lowerPane.height
        if (pairTotal <= 1) return false

        const upperMin = this.getPaneMinHeight(upperSpec, vp.plotHeight)
        const lowerMin = this.getPaneMinHeight(lowerSpec, vp.plotHeight)

        const minUpper = Math.max(1, Math.min(upperMin, pairTotal - 1))
        const maxUpper = Math.max(minUpper, pairTotal - Math.max(1, Math.min(lowerMin, pairTotal - 1)))
        const nextUpper = Math.max(minUpper, Math.min(maxUpper, upperPane.height + deltaY))
        const nextLower = pairTotal - nextUpper

        if (Math.abs(nextUpper - upperPane.height) < 0.01 && Math.abs(nextLower - lowerPane.height) < 0.01) {
            return false
        }

        const gap = Math.max(0, this.opt.paneGap ?? 0)
        const totalGaps = gap * Math.max(0, visibleSpecs.length - 1)
        const availableH = Math.max(1, vp.plotHeight - totalGaps)

        const currentUpperRatio = this.paneRatios.get(upperSpec.id) ?? upperSpec.ratio ?? 0
        const currentLowerRatio = this.paneRatios.get(lowerSpec.id) ?? lowerSpec.ratio ?? 0
        const pairRatio = Math.max(1e-6, currentUpperRatio + currentLowerRatio)

        this.paneRatios.set(upperSpec.id, pairRatio * (nextUpper / pairTotal))
        this.paneRatios.set(lowerSpec.id, pairRatio * (nextLower / pairTotal))

        this.normalizeVisiblePaneRatios(visibleSpecs)
        this.syncPaneRatiosToSpecs()

        // 用最新 ratio 重排，保证所有 pane 一致
        this.layoutPanes()
        this.scheduleDraw()
        return true
    }

    /**
     * 动态添加 pane
     * @param paneId pane 标识符
     */
    addPane(paneId: string): void {
        // 检查是否已存在
        if (this.paneRenderers.some(r => r.getPane().id === paneId)) {
            console.warn(`Pane "${paneId}" already exists`)
            return
        }

        const pane = new Pane(paneId)

        const plotCanvas = document.createElement('canvas')
        const yAxisCanvas = document.createElement('canvas')

        const isMain = paneId === 'main'
        plotCanvas.id = `${paneId}-plot`
        plotCanvas.className = isMain ? 'plot-canvas main' : 'plot-canvas sub'
        plotCanvas.style.position = 'absolute'
        plotCanvas.style.left = '0'
        plotCanvas.style.top = '0'

        yAxisCanvas.id = `${paneId}-yAxis`
        yAxisCanvas.className = 'right-axis'
        yAxisCanvas.style.position = 'absolute'
        yAxisCanvas.style.right = '0'  // 用 right 定位，贴右边

        const renderer = new PaneRenderer(
            { plotCanvas, yAxisCanvas },
            pane,
            {
                rightAxisWidth: this.opt.rightAxisWidth,
                yPaddingPx: 0, // 副图无 padding
                priceLabelWidth: this.opt.priceLabelWidth,
            }
        )

        this.paneRenderers.push(renderer)

        // 添加到 DOM
        const canvasLayer = this.dom.canvasLayer
        if (canvasLayer) {
            canvasLayer.appendChild(plotCanvas)
            canvasLayer.appendChild(yAxisCanvas)
        }

        // 通知渲染器管理器
        this.rendererPluginManager.addKnownPaneId(paneId)
    }

    /**
     * 动态移除 pane
     * @param paneId pane 标识符
     */
    removePane(paneId: string): void {
        const index = this.paneRenderers.findIndex(r => r.getPane().id === paneId)
        if (index === -1) return

        const renderer = this.paneRenderers[index]
        if (!renderer) return

        const dom = renderer.getDom()

        // 从 DOM 移除
        dom.plotCanvas.remove()
        dom.yAxisCanvas.remove()

        // 从数组移除
        this.paneRenderers.splice(index, 1)

        // 通知渲染器管理器
        this.rendererPluginManager.removeKnownPaneId(paneId)
    }

    /**
     * 检查 pane 是否存在
     * @param paneId pane 标识符
     */
    hasPane(paneId: string): boolean {
        return this.paneRenderers.some(r => r.getPane().id === paneId)
    }

    // ========== 副图管理 API ==========

    /** 副图渲染器名称前缀 */
    private static readonly SUB_PANE_PREFIX = 'sub_'

    /**
     * 创建副图面板并注册指标渲染器
     * @param indicatorId 指标类型
     * @param params 指标参数
     * @returns 是否创建成功
     */
    createSubPane(indicatorId: SubIndicatorType, params?: Record<string, number>): boolean {
        const paneId = `${Chart.SUB_PANE_PREFIX}${indicatorId}`

        // 已存在则更新参数
        if (this.hasPane(paneId)) {
            const rendererName = `${indicatorId.toLowerCase()}_${paneId}`
            if (params) {
                this.updateRendererConfig(rendererName, params)
            }
            return true
        }

        // 创建 pane
        this.addPane(paneId)

        // 创建并注册渲染器
        const renderer = createSubIndicatorRenderer({ indicatorId, paneId })
        this.useRenderer(renderer, params)

        // 重新布局
        this.layoutPanes()
        this.scheduleDraw()

        return true
    }

    /**
     * 移除副图面板及其渲染器
     * @param indicatorId 指标类型
     */
    removeSubPane(indicatorId: SubIndicatorType): void {
        const paneId = `${Chart.SUB_PANE_PREFIX}${indicatorId}`

        if (!this.hasPane(paneId)) return

        // 移除渲染器
        const rendererName = `${indicatorId.toLowerCase()}_${paneId}`
        this.removeRenderer(rendererName)

        // 移除 pane
        this.removePane(paneId)

        // 重新布局
        this.layoutPanes()
        this.scheduleDraw()
    }

    /**
     * 清除所有副图面板
     */
    clearSubPanes(): void {
        const subPaneIds = this.paneRenderers
            .map(r => r.getPane().id)
            .filter(id => id.startsWith(Chart.SUB_PANE_PREFIX))

        for (const paneId of subPaneIds) {
            // 提取 indicatorId
            const indicatorId = paneId.slice(Chart.SUB_PANE_PREFIX.length) as SubIndicatorType
            this.removeSubPane(indicatorId)
        }
    }

    /**
     * 获取当前所有副图指标类型
     */
    getSubPaneIndicators(): SubIndicatorType[] {
        return this.paneRenderers
            .map(r => r.getPane().id)
            .filter(id => id.startsWith(Chart.SUB_PANE_PREFIX))
            .map(id => id.slice(Chart.SUB_PANE_PREFIX.length) as SubIndicatorType)
    }

    /**
     * 平移价格轴（用于上下拖动）
     * @param paneId 目标 pane ID
     * @param deltaY Y轴像素偏移（正数向下拖动）
     */
    translatePrice(paneId: string, deltaY: number): void {
        const renderer = this.paneRenderers.find(r => r.getPane().id === paneId)
        if (!renderer) return

        const pane = renderer.getPane()
        const priceOffset = pane.yAxis.deltaYToPriceOffset(deltaY)
        const currentOffset = pane.yAxis.getPriceOffset()
        pane.yAxis.setPriceOffset(currentOffset + priceOffset)
        this.scheduleDraw()
    }

    /**
     * 更新数据并请求重绘
     * @param data K 线数据数组
     */
    updateData(data: KLineData[]) {
        this.data = data ?? []

        // 重算 DOM scrollLeft 状态, 防止左右滚动超出数据长度范围
        const container = this.dom.container
        if (container) {
            const contentWidth = this.getContentWidth()
            const maxScrollLeft = Math.max(0, contentWidth - container.clientWidth)
            if (container.scrollLeft > maxScrollLeft) {
                container.scrollLeft = maxScrollLeft
            }
        }

        // 重置交互状态
        this.interaction.reset()

        this.scheduleDraw()
    }

    /** 获取当前数据源（供 renderers 和 interaction 使用） */
    getData(): KLineData[] {
        return this.data
    }

    /** 获取内容总宽度（用于外部 scroll-content 撑开 scrollWidth） */
    getContentWidth(): number {
        const n = this.data?.length ?? 0
        const dpr = this.getEffectiveDpr()
        const { startXPx, unitPx } = getPhysicalKLineConfig(this.opt.kWidth, this.opt.kGap, dpr)
        const plotWidth = (startXPx + n * unitPx) / dpr
        return plotWidth
    }


    /** 容器尺寸变化时调用 */
    resize() {
        const vp = this.computeViewport()
        // 防御性检查：容器尺寸无效时跳过布局
        if (!vp || vp.viewWidth < 10 || vp.viewHeight < 10) {
            return
        }
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
    async destroy() {
        if (this.raf != null) cancelAnimationFrame(this.raf)
        this.raf = null

        // 清理尺寸观察器
        this.resizeObserver?.disconnect()
        this.resizeObserver = undefined
        this.preciseDpr = 0
        this.observedSize = { width: 0, height: 0 }

        this.viewport = null
        this.paneRenderers.forEach((r) => r.destroy())
        this.paneRenderers = []

        // 清理渲染器插件管理器（会调用所有 onUninstall）
        this.rendererPluginManager.clear()

        this.onZoomChange = undefined
        this.onViewportChange = undefined
        await this.pluginHost.destroy()
    }

    /** 初始化所有 pane */
    private initPanes() {
        this.paneRenderers = this.opt.panes.map((spec) => {
            const pane = new Pane(spec.id)

            const plotCanvas = document.createElement('canvas')
            const yAxisCanvas = document.createElement('canvas')

            const isMain = spec.id === 'main'
            plotCanvas.id = `${spec.id}-plot`
            plotCanvas.className = isMain ? 'plot-canvas main' : 'plot-canvas sub'
            plotCanvas.style.position = 'absolute'
            plotCanvas.style.left = '0'
            plotCanvas.style.top = '0'

            yAxisCanvas.id = `${spec.id}-yAxis`
            yAxisCanvas.className = 'right-axis'
            yAxisCanvas.style.position = 'absolute'
            yAxisCanvas.style.right = '0'  // 用 right 定位，贴右边

            const renderer = new PaneRenderer(
                { plotCanvas, yAxisCanvas },
                pane,
                {
                    rightAxisWidth: this.opt.rightAxisWidth,
                    yPaddingPx: this.opt.yPaddingPx,
                    priceLabelWidth: this.opt.priceLabelWidth,
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
        }
    }


    private syncPaneRatiosFromSpecs(specs: PaneSpec[]): void {
        const next = new Map<string, number>()
        for (const spec of specs) {
            const prev = this.paneRatios.get(spec.id)
            const incoming = Number.isFinite(spec.ratio) ? spec.ratio : 0
            const ratio = prev !== undefined ? prev : (incoming > 0 ? incoming : 1)
            next.set(spec.id, ratio)
        }
        this.paneRatios = next
        this.normalizeVisiblePaneRatios(specs)
        this.syncPaneRatiosToSpecs()
    }

    private syncPaneRatiosToSpecs(): void {
        const visible = this.opt.panes.filter(p => p.visible !== false)
        const visibleSum = visible.reduce((s, p) => s + (this.paneRatios.get(p.id) ?? p.ratio ?? 0), 0)
        const safeVisibleSum = visibleSum > 0 ? visibleSum : 1

        this.opt.panes = this.opt.panes.map((spec) => {
            const ratio = this.paneRatios.get(spec.id) ?? spec.ratio ?? 0
            if (spec.visible === false) {
                return { ...spec, ratio }
            }
            return { ...spec, ratio: ratio / safeVisibleSum }
        })
    }

    private normalizeVisiblePaneRatios(specs: PaneSpec[]): void {
        const visible = specs.filter(p => p.visible !== false)
        if (visible.length === 0) return

        let sum = 0
        for (const spec of visible) {
            const raw = this.paneRatios.get(spec.id) ?? spec.ratio ?? 0
            const safe = Number.isFinite(raw) && raw > 0 ? raw : 0
            this.paneRatios.set(spec.id, safe)
            sum += safe
        }

        if (sum <= 0) {
            const equal = 1 / visible.length
            for (const spec of visible) {
                this.paneRatios.set(spec.id, equal)
            }
            return
        }

        for (const spec of visible) {
            const v = this.paneRatios.get(spec.id) ?? 0
            this.paneRatios.set(spec.id, v / sum)
        }
    }

    private getPaneMinHeight(spec: PaneSpec, plotHeight: number): number {
        const fallback = this.opt.defaultPaneMinHeightPx ?? 60
        const raw = spec.minHeightPx ?? fallback
        return Math.max(1, Math.min(Math.round(raw), Math.max(1, plotHeight)))
    }

    private computePaneHeightsByRatio(visibleSpecs: PaneSpec[], availableH: number): number[] {
        if (visibleSpecs.length === 0) return []

        const ratios = visibleSpecs.map(spec => this.paneRatios.get(spec.id) ?? spec.ratio ?? 0)
        const ratioSum = ratios.reduce((s, r) => s + (r > 0 ? r : 0), 0)
        const safeRatios = ratioSum > 0
            ? ratios.map(r => (r > 0 ? r : 0) / ratioSum)
            : visibleSpecs.map(() => 1 / visibleSpecs.length)

        const heights = safeRatios.map(r => Math.max(1, Math.round(availableH * r)))
        const mins = visibleSpecs.map(spec => this.getPaneMinHeight(spec, availableH))

        for (let i = 0; i < heights.length; i++) {
            heights[i] = Math.max(heights[i]!, Math.min(mins[i]!, availableH))
        }

        let total = heights.reduce((s, h) => s + h, 0)

        if (total > availableH) {
            let overflow = total - availableH
            while (overflow > 0) {
                let shrunk = false
                for (let i = heights.length - 1; i >= 0 && overflow > 0; i--) {
                    const minH = Math.max(1, Math.min(mins[i]!, availableH))
                    const h = heights[i]!
                    if (h > minH) {
                        heights[i] = h - 1
                        overflow--
                        shrunk = true
                    }
                }
                if (!shrunk) break
            }
        } else if (total < availableH) {
            heights[heights.length - 1] = (heights[heights.length - 1] ?? 1) + (availableH - total)
        }

        total = heights.reduce((s, h) => s + h, 0)
        if (total !== availableH && heights.length > 0) {
            heights[heights.length - 1] = Math.max(1, (heights[heights.length - 1] ?? 1) + (availableH - total))
        }

        return heights
    }

    /** 计算每个 pane 的布局（top 和 height） */
    private layoutPanes() {
        const vp = this.viewport
        if (!vp) return

        const visibleSpecs = this.opt.panes.filter(p => p.visible !== false)
        if (visibleSpecs.length === 0) return

        const gap = Math.max(0, this.opt.paneGap ?? 0)
        let y = 0

        const totalGaps = gap * Math.max(0, visibleSpecs.length - 1)
        const availableH = Math.max(1, vp.plotHeight - totalGaps)

        this.normalizeVisiblePaneRatios(visibleSpecs)
        const paneHeights = this.computePaneHeightsByRatio(visibleSpecs, availableH)

        for (let i = 0; i < visibleSpecs.length; i++) {
            const spec = visibleSpecs[i]
            if (!spec) continue

            const renderer = this.paneRenderers.find(r => r.getPane().id === spec.id)
            if (!renderer) continue

            const pane = renderer.getPane()
            const h = paneHeights[i] ?? 1

            pane.setLayout(y, h)
            if (pane.id !== 'main') {
                pane.setPadding(0, 0)
            } else {
                pane.setPadding(this.opt.yPaddingPx, this.opt.yPaddingPx)
            }

            renderer.resize(vp.plotWidth, h, vp.dpr)
            this.rendererPluginManager.notifyResize(pane.id, wrapPaneInfo(pane))
            const dom = renderer.getDom()
            dom.plotCanvas.style.top = `${y}px`
            dom.yAxisCanvas.style.top = `${y}px`

            y += h + gap
        }

        // 按实际像素高度回写 ratio，确保后续 resize 视觉比例稳定
        const finalAvailable = Math.max(1, availableH)
        for (const spec of visibleSpecs) {
            const renderer = this.paneRenderers.find(r => r.getPane().id === spec.id)
            if (!renderer) continue
            const h = renderer.getPane().height
            this.paneRatios.set(spec.id, h / finalAvailable)
        }
        this.normalizeVisiblePaneRatios(visibleSpecs)
        this.syncPaneRatiosToSpecs()
    }
    private computeViewport(): Viewport | null {
        const container = this.dom.container
        if (!container) return null

        const observedWidth = this.observedSize.width
        const observedHeight = this.observedSize.height
        const viewWidth = observedWidth > 0
            ? observedWidth
            : Math.max(1, Math.round(container.clientWidth))
        const viewHeight = observedHeight > 0
            ? observedHeight
            : Math.max(1, Math.round(container.clientHeight))

        const yAxisTotalWidth = this.opt.rightAxisWidth + (this.opt.priceLabelWidth || 60)
        const plotWidth = Math.round(viewWidth - yAxisTotalWidth)
        const plotHeight = Math.round(viewHeight - this.opt.bottomAxisHeight)

        let dpr = this.getEffectiveDpr()

        const MAX_CANVAS_PIXELS = 16 * 1024 * 1024
        const requestedPixels = viewWidth * dpr * (viewHeight * dpr)
        if (requestedPixels > MAX_CANVAS_PIXELS) {
            dpr = Math.sqrt(MAX_CANVAS_PIXELS / (viewWidth * viewHeight))
        }

        // 对齐 scrollLeft，消除 translate 亚像素偏移
        const scrollLeft = Math.round(container.scrollLeft * dpr) / dpr

        this.dom.canvasLayer.style.width = `${viewWidth}px`
        this.dom.canvasLayer.style.height = `${viewHeight}px`

        this.dom.xAxisCanvas.style.width = `${plotWidth}px`
        this.dom.xAxisCanvas.style.height = `${this.opt.bottomAxisHeight}px`
        this.dom.xAxisCanvas.width = Math.round(plotWidth * dpr)
        this.dom.xAxisCanvas.height = Math.round(this.opt.bottomAxisHeight * dpr)

        const vp: Viewport = {
            viewWidth,
            viewHeight,
            plotWidth,
            plotHeight,
            scrollLeft,
            dpr,
        }
        this.viewport = vp
        this.onViewportChange?.(vp)
        return vp
    }
}
