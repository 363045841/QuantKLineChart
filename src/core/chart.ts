import type { KLineData } from '@/types/price'
import { getVisibleRange } from '@/core/viewport/viewport'
import { Pane, type VisibleRange } from '@/core/layout/pane'
import { InteractionController } from '@/core/controller/interaction'
import { PaneRenderer } from '@/core/paneRenderer'
import { MarkerManager, type CustomMarkerEntity } from './marker/registry'
import { getPhysicalKLineConfig, calcKWidthPx } from '@/core/utils/klineConfig'
import { computeContentWidth } from '@/core/chart-store'

import {
    createPluginHost,
    type PluginHostImpl,
    RendererPluginManager,
    type RendererPlugin,
    type RendererPluginWithHost,
    type RenderContext,
    wrapPaneInfo,
    type PaneRole,
    type PaneCapabilities,
} from '@/plugin'
import { createSubIndicatorRenderer, type SubIndicatorType } from '@/core/renderers/Indicator'
import { DrawingStore } from '@/core/drawing'
import { createDrawingRendererPlugin } from '@/core/drawing/plugin'

// 重新导出以保持向后兼容
export { getPhysicalKLineConfig, calcKWidthPx }

/**
 * 图表 DOM 元素引用
 * @property container 图表容器 div
 * @property canvasLayer Canvas 层容器 div（包含所有绘制 canvas）
 */
/**
 * 图表 DOM 元素引用
 * @property container 图表容器 div
 * @property canvasLayer Canvas 层容器 div（包含所有绘制 canvas）
 * @property xAxisCanvas X 轴时间轴 canvas
 */
export type ChartDom = {
    container: HTMLDivElement
    canvasLayer: HTMLDivElement
    rightAxisLayer: HTMLDivElement
    xAxisCanvas: HTMLCanvasElement
}

/**
 * Pane 面板配置
 * @property id Pane 标识符
 * @property ratio Pane 高度占比
 * @property visible 是否可见（默认 true）
 */
export type PaneSpec = {
    id: string
    ratio: number
    visible?: boolean
    minHeightPx?: number
    role?: PaneRole
    capabilities?: Partial<PaneCapabilities>
}

export type PaneRendererDom = {
    plotCanvas: HTMLCanvasElement
    yAxisCanvas: HTMLCanvasElement
}

export type ChartOptions = {
    /** K 线宽度（可选，由 zoomLevel 派生） */
    kWidth?: number
    /** K 线间隙（可选，由 DPR 计算） */
    kGap?: number
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

    /**
     * 缩放级别数量（默认 10）
     * - 将 minKWidth ~ maxKWidth 划分为多少个离散级别
     * - 例如 10 表示有 10 个缩放级别（1-10）
     */
    zoomLevels?: number

    /**
     * 初始缩放级别（1 ~ zoomLevels，默认 1）
     * 未指定时默认为最小级别
     */
    initialZoomLevel?: number
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

type ResolvedChartOptions = Omit<ChartOptions, 'kWidth' | 'kGap'> & {
    kWidth: number
    kGap: number
}

export class Chart {
    private dom: ChartDom
    private opt: ResolvedChartOptions
    private data: KLineData[] = []

    private raf: number | null = null
    private viewport: Viewport | null = null

    private paneRenderers: PaneRenderer[] = []
    private markerManager: MarkerManager
    private drawingStore = new DrawingStore()
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

    /** pane 布局回流回调（Chart -> UI 单向） */
    private onPaneLayoutChange?: (panes: PaneSpec[]) => void

    /** 数据变化回调（供外部同步 dataLength） */
    private onDataChange?: (data: KLineData[]) => void

    /** 当前缩放级别（1 ~ zoomLevelCount） */
    private currentZoomLevel: number = 1

    /** 缩放级别总数 */
    private readonly zoomLevelCount: number

    /**
     * 创建图表实例
     * @param dom 由 Vue 组件传入的 DOM 句柄
     * @param opt 初始配置
     */
    constructor(dom: ChartDom, opt: ChartOptions) {
        this.dom = dom
        const { kWidth: _kWidth, kGap: _kGap, ...restOpt } = opt
        // Chart 不持有业务 SSOT，kWidth/kGap/zoomLevel 由外部通过 applyRenderState() 传入
        this.opt = { ...restOpt, kWidth: _kWidth ?? 0, kGap: _kGap ?? 0 }
        this.interaction = new InteractionController(this)
        this.markerManager = new MarkerManager()
        this.pluginHost = createPluginHost()
        this.rendererPluginManager = new RendererPluginManager()

        // 注入依赖
        this.rendererPluginManager.setPluginHost(this.pluginHost)
        this.rendererPluginManager.setInvalidateCallback(() => this.scheduleDraw())

        this.syncPaneRatiosFromSpecs(this.opt.panes)

        // 缩放级别由外部 SSOT 管理，Chart 只接收不计算
        this.zoomLevelCount = Math.max(2, Math.round(this.opt.zoomLevels ?? 20))
        this.currentZoomLevel = this.opt.initialZoomLevel ?? 1
        this.currentZoomLevel = Math.max(1, Math.min(this.zoomLevelCount, this.currentZoomLevel))
        // 注意：初始 kWidth/kGap 应由外部通过 applyRenderState() 传入

        this.initPanes()
        this.useRenderer(createDrawingRendererPlugin({ store: this.drawingStore }))
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
            if (yAxisCtx) {
                const yAxisWidth = yAxisCtx.canvas.width / vp.dpr
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
                crosshairIndex: this.interaction.getCrosshairIndex(),
                yAxisCtx: yAxisCtx ?? undefined,
                zoomLevel: this.currentZoomLevel,
                zoomLevelCount: this.zoomLevelCount,
                viewport: {
                    scrollLeft: vp.scrollLeft,
                    plotWidth: vp.plotWidth,
                    plotHeight: vp.plotHeight,
                },
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
                pane: {
                    id: 'xAxis',
                    role: 'auxiliary',
                    capabilities: {
                        showPriceAxisTicks: false,
                        showCrosshairPriceLabel: false,
                        candleHitTest: false,
                        supportsPriceTranslate: false,
                    },
                    top: 0,
                    height: this.opt.bottomAxisHeight,
                    yAxis: {
                        priceToY: () => 0,
                        yToPrice: () => 0,
                        getPaddingTop: () => 0,
                        getPaddingBottom: () => 0,
                        getPriceOffset: () => 0,
                        getDisplayRange: (baseRange) => baseRange ?? { maxPrice: 0, minPrice: 0 },
                    },
                    priceRange: { maxPrice: 0, minPrice: 0 },
                },
                data: this.data,
                range,
                scrollLeft: vp.scrollLeft,
                kWidth: this.opt.kWidth,
                kGap: this.opt.kGap,
                dpr: vp.dpr,
                paneWidth: vp.plotWidth,
                kLinePositions,
                xAxisCtx,
                viewport: {
                    scrollLeft: vp.scrollLeft,
                    plotWidth: vp.plotWidth,
                    plotHeight: vp.plotHeight,
                },
            }
            const errors = this.rendererPluginManager.renderPlugin('timeAxis', timeAxisContext)
            if (errors.length > 0) {
                this.pluginHost.events.emit('renderer:error', { paneId: 'timeAxis', errors })
            }
        }
    }

    // ========== Render State API (Vue SSOT) ==========

    /**
     * 应用渲染状态（由 Vue/Store 层在状态更新后调用）
     * Chart 不拥有业务 SSOT，只负责接收参数并渲染
     * 这是写入 opt.kWidth/kGap 和 currentZoomLevel 的唯一入口
     */
    applyRenderState(kWidth: number, kGap: number, zoomLevel?: number): void {
        this.opt = { ...this.opt, kWidth, kGap }
        if (zoomLevel !== undefined) {
            this.currentZoomLevel = Math.max(1, Math.min(this.zoomLevelCount, zoomLevel))
        }
        this.scheduleDraw()
    }

    /** 获取总缩放级别数 */
    getZoomLevelCount(): number {
        return this.zoomLevelCount
    }

    /** 注册视口变化回调 */
    setOnViewportChange(cb: (viewport: Viewport) => void) {
        this.onViewportChange = cb
    }

    /** 注册 pane 布局回流回调 */
    setOnPaneLayoutChange(cb: (panes: PaneSpec[]) => void) {
        this.onPaneLayoutChange = cb
    }

    /** 注册数据变化回调 */
    setOnDataChange(cb: (data: KLineData[]) => void) {
        this.onDataChange = cb
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
        // 缩放参数由 zoomLevel 派生，不允许直接修改
        if (partial.kWidth !== undefined) {
            console.warn('[Chart] kWidth cannot be set directly. Use applyRenderState() instead.')
            delete partial.kWidth
        }
        if (partial.kGap !== undefined) {
            delete partial.kGap
        }

        if (partial.panes) {
            const nextPanes = partial.panes.map((pane) => ({ ...pane }))
            this.opt = { ...this.opt, ...partial, panes: nextPanes }
            this.applyPaneLayoutSpecs(nextPanes)
            return
        }

        this.opt = { ...this.opt, ...partial }
        this.resize()
    }

    /** 更新 pane 布局配置
     * @param panes 新的 pane 配置数组
     */
    updatePaneLayout(panes: PaneSpec[]): void {
        this.applyPaneLayoutSpecs(panes)
    }

    setPaneDefinitions(defs: PaneSpec[]): void {
        this.applyPaneLayoutSpecs(defs)
    }

    upsertPane(def: PaneSpec): void {
        const idx = this.opt.panes.findIndex((pane) => pane.id === def.id)
        if (idx === -1) {
            this.applyPaneLayoutSpecs([...this.opt.panes, { ...def }])
            return
        }

        const next = [...this.opt.panes]
        next[idx] = { ...next[idx], ...def }
        this.applyPaneLayoutSpecs(next)
    }

    removePaneDefinition(paneId: string): void {
        if (!this.opt.panes.some((pane) => pane.id === paneId)) return
        this.paneRatios.delete(paneId)
        this.applyPaneLayoutSpecs(this.opt.panes.filter((pane) => pane.id !== paneId))
    }

    bindIndicatorToPane(paneId: string, indicatorId: SubIndicatorType, params?: Record<string, number>): void {
        const paneExists = this.opt.panes.some((pane) => pane.id === paneId)
        if (!paneExists) {
            this.upsertPane({ id: paneId, ratio: 1, visible: true, role: 'indicator' })
        }

        const rendererName = `${indicatorId.toLowerCase()}_${paneId}`
        const existing = this.getRenderer(rendererName)
        if (existing) {
            if (params) this.updateRendererConfig(rendererName, params)
            return
        }

        const renderer = createSubIndicatorRenderer({ indicatorId, paneId })
        this.useRenderer(renderer, params)
    }

    /** 更新绘图对象 */
    setDrawings(drawings: import('@/plugin').DrawingObject[]): void {
        this.drawingStore.setAll(drawings)
        this.scheduleDraw()
    }

    /** 更新选中的绘图 ID */
    setSelectedDrawingId(id: string | null): void {
        this.drawingStore.setSelectedId(id)
    }

    /** 获取当前 pane 布局快照（含 ratio） */
    getPaneLayoutSpecs(): PaneSpec[] {
        const visible = this.opt.panes.filter(p => p.visible !== false)
        const sum = visible.reduce((s, p) => s + (this.paneRatios.get(p.id) ?? p.ratio ?? 0), 0)
        const safeSum = sum > 0 ? sum : 1
        return this.opt.panes.map((spec) => {
            const base = this.paneRatios.get(spec.id) ?? spec.ratio ?? 0
            const ratio = spec.visible === false ? base : base / safeSum
            const pane = this.paneRenderers.find((r) => r.getPane().id === spec.id)?.getPane()
            return {
                ...spec,
                ratio,
                role: pane?.role ?? spec.role,
                capabilities: pane ? { ...pane.capabilities } : spec.capabilities,
            }
        })
    }

    private emitPaneLayoutChange(): void {
        this.onPaneLayoutChange?.(this.getPaneLayoutSpecs())
    }

    private applyPaneLayoutSpecs(panes: PaneSpec[]): void {
        this.opt.panes = panes.map((spec) => ({ ...spec }))
        this.syncPaneRatiosFromSpecs(this.opt.panes)
        this.initPanes()
        this.layoutPanes()
        this.emitPaneLayoutChange()
        this.scheduleDraw()
    }

    /**
     * 调整相邻 pane 边界（支持连锁挤压）
     * @param upperPaneId 上方 pane ID（边界位于此 pane 与其下方邻居之间）
     * @param deltaY Y 方向位移（逻辑像素，正数表示边界向下，upper 增大；负数表示向上，upper 减小）
     */
    resizePaneBoundary(upperPaneId: string, deltaY: number): boolean {
        // === 1. 参数校验 ===
        if (!Number.isFinite(deltaY) || deltaY === 0) return false
        const vp = this.viewport
        if (!vp) return false

        // === 2. 定位相邻 pane 对（边界两侧） ===
        const visibleSpecs = this.opt.panes.filter(p => p.visible !== false)
        const boundaryIndex = visibleSpecs.findIndex(p => p.id === upperPaneId)
        if (boundaryIndex < 0 || boundaryIndex >= visibleSpecs.length - 1) return false

        const upperSpec = visibleSpecs[boundaryIndex]
        const lowerSpec = visibleSpecs[boundaryIndex + 1]
        if (!upperSpec || !lowerSpec) return false

        // === 3. 收集所有 pane 当前高度 ===
        const heights = new Map<string, number>()
        for (const spec of visibleSpecs) {
            const renderer = this.paneRenderers.find(r => r.getPane().id === spec.id)
            if (renderer) {
                heights.set(spec.id, renderer.getPane().height)
            }
        }

        // === 4. 连锁挤压/扩展 ===
        // deltaY > 0: 边界下移，upper expand，lower shrink
        // deltaY < 0: 边界上移，upper shrink，lower expand
        const expandIdx = deltaY > 0 ? boundaryIndex : boundaryIndex + 1
        const shrinkIdx = deltaY > 0 ? boundaryIndex + 1 : boundaryIndex
        const expandDir = deltaY > 0 ? -1 : 1  // expand 方向（向边界方向找）
        const shrinkDir = deltaY > 0 ? 1 : -1  // shrink 方向（远离边界方向找）

        let remaining = Math.abs(deltaY)

        // 先尝试 shrink（从 shrinkIdx 开始，沿 shrinkDir 方向连锁）
        let shrinkCursor = shrinkIdx
        while (remaining > 0 && shrinkCursor >= 0 && shrinkCursor < visibleSpecs.length) {
            const spec = visibleSpecs[shrinkCursor]
            if (!spec) break

            const currentH = heights.get(spec.id) ?? 0
            const minH = this.getPaneMinHeight(spec, vp.plotHeight)
            const canShrink = Math.max(0, currentH - minH)

            if (canShrink > 0) {
                const shrink = Math.min(canShrink, remaining)
                heights.set(spec.id, currentH - shrink)
                remaining -= shrink
            }

            // 继续向 shrinkDir 方向找下一个可 shrink 的 pane
            if (remaining > 0) {
                shrinkCursor += shrinkDir
            }
        }

        // 如果还有剩余（无法完全 shrink），说明拖拽无效
        if (remaining > 0) return false

        // 将节省的高度全部加到 expand 方
        const expandSpec = visibleSpecs[expandIdx]
        if (!expandSpec) return false
        const expandCurrentH = heights.get(expandSpec.id) ?? 0
        heights.set(expandSpec.id, expandCurrentH + Math.abs(deltaY))

        // === 5. 将像素高度转换为 ratio ===
        const gap = Math.max(0, this.opt.paneGap ?? 0)
        const totalGaps = gap * Math.max(0, visibleSpecs.length - 1)
        const availableH = Math.max(1, vp.plotHeight - totalGaps)

        for (const spec of visibleSpecs) {
            const h = heights.get(spec.id) ?? 0
            this.paneRatios.set(spec.id, h / availableH)
        }

        // === 6. 归一化并同步 ===
        this.normalizeVisiblePaneRatios(visibleSpecs)
        this.syncPaneRatiosToSpecs()

        // === 7. 应用布局 ===
        this.layoutPanes()
        this.emitPaneLayoutChange()
        this.scheduleDraw()
        return true
    }

    private resolvePaneRole(spec: PaneSpec, index: number): PaneRole {
        if (spec.role) return spec.role
        return index === 0 ? 'price' : 'indicator'
    }


    addPane(paneId: string): void {
        if (this.opt.panes.some((spec) => spec.id === paneId)) {
            console.warn(`Pane "${paneId}" already exists`)
            return
        }

        const hasPricePane = this.opt.panes.some((spec, index) => this.resolvePaneRole(spec, index) === 'price')
        const role: PaneRole = hasPricePane ? 'indicator' : 'price'
        this.applyPaneLayoutSpecs([
            ...this.opt.panes,
            { id: paneId, ratio: 1, visible: true, role },
        ])
    }

    /**
     * 动态移除 pane
     * @param paneId pane 标识符
     */
    removePane(paneId: string): void {
        if (!this.opt.panes.some((spec) => spec.id === paneId)) return

        const next = this.opt.panes.filter((spec) => spec.id !== paneId)
        this.paneRatios.delete(paneId)
        this.applyPaneLayoutSpecs(next)
    }

    /**
     * 检查 pane 是否存在
     * @param paneId pane 标识符
     */
    hasPane(paneId: string): boolean {
        return this.opt.panes.some((spec) => spec.id === paneId)
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
        const rendererName = `${indicatorId.toLowerCase()}_${paneId}`

        const existingRenderer = this.getRenderer(rendererName)
        if (existingRenderer) {
            if (params) this.updateRendererConfig(rendererName, params)
            return true
        }

        const visibleSpecs = this.opt.panes.filter((pane) => pane.visible !== false)
        const pricePanes = visibleSpecs.filter((pane, index) => this.resolvePaneRole(pane, index) === 'price')
        const indicatorPanes = visibleSpecs.filter((pane, index) => this.resolvePaneRole(pane, index) === 'indicator')

        if (pricePanes.length === 1) {
            const pricePane = pricePanes[0]
            if (pricePane) {
                this.paneRatios.set(pricePane.id, 3)
            }
            for (const pane of indicatorPanes) {
                this.paneRatios.set(pane.id, 1)
            }
            this.paneRatios.set(paneId, 1)
        } else {
            this.paneRatios.set(paneId, 1)
        }

        this.upsertPane({ id: paneId, ratio: this.paneRatios.get(paneId) ?? 1, visible: true, role: 'indicator' })
        this.bindIndicatorToPane(paneId, indicatorId, params)
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

        this.paneRatios.delete(paneId)
        this.applyPaneLayoutSpecs(this.opt.panes.filter((spec) => spec.id !== paneId))
    }

    /**
     * 清除所有副图面板
     */
    clearSubPanes(): void {
        const subPaneIds = this.opt.panes
            .map((spec) => spec.id)
            .filter((id) => id.startsWith(Chart.SUB_PANE_PREFIX))

        if (subPaneIds.length === 0) return

        for (const paneId of subPaneIds) {
            const indicatorId = paneId.slice(Chart.SUB_PANE_PREFIX.length) as SubIndicatorType
            const rendererName = `${indicatorId.toLowerCase()}_${paneId}`
            this.removeRenderer(rendererName)
            this.paneRatios.delete(paneId)
        }

        this.applyPaneLayoutSpecs(this.opt.panes.filter((spec) => !spec.id.startsWith(Chart.SUB_PANE_PREFIX)))
    }

    /**
     * 获取当前所有副图指标类型
     */
    getSubPaneIndicators(): SubIndicatorType[] {
        return this.opt.panes
            .map((spec) => spec.id)
            .filter((id) => id.startsWith(Chart.SUB_PANE_PREFIX))
            .map((id) => id.slice(Chart.SUB_PANE_PREFIX.length) as SubIndicatorType)
    }

    /**
     * 平移价格轴（用于主图区域上下拖动）
     * @param paneId 目标 pane ID
     * @param deltaY Y轴像素偏移（正数向下拖动）
     */
    translatePrice(paneId: string, deltaY: number): void {
        const renderer = this.paneRenderers.find(r => r.getPane().id === paneId)
        if (!renderer) return

        const pane = renderer.getPane()
        if (!pane.capabilities.supportsPriceTranslate) return

        const priceOffset = pane.yAxis.deltaYToPriceOffset(deltaY)
        const currentOffset = pane.yAxis.getPriceOffset()
        pane.yAxis.setPriceOffset(currentOffset + priceOffset)
        this.scheduleDraw()
    }

    /**
     * 缩放价格轴（用于右侧刻度栏上下拖动）
     * @param paneId 目标 pane ID
     * @param deltaY Y轴像素偏移（向上拖动放大，向下拖动缩小）
     */
    scalePrice(paneId: string, deltaY: number): void {
        const renderer = this.paneRenderers.find(r => r.getPane().id === paneId)
        if (!renderer) return

        const pane = renderer.getPane()
        if (!pane.capabilities.supportsPriceTranslate) return

        pane.yAxis.scaleByDelta(deltaY)
        this.scheduleDraw()
    }
    /**
     * 更新数据并请求重绘
     * @param data K 线数据数组
     */
    updateData(data: KLineData[]) {
        this.data = data ?? []
        this.onDataChange?.(this.data)

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

    private getTrailingSlotCount(): number {
        return 24
    }

    getLogicalSlotCount(): number {
        return this.data.length + this.getTrailingSlotCount()
    }

    getTimestampAtLogicalIndex(index: number): number | null {
        if (!Number.isInteger(index) || index < 0 || index >= this.data.length) return null
        return this.data[index]?.timestamp ?? null
    }

    /** 根据视口内 X 坐标反查逻辑索引（允许超出最后一根 K 线） */
    getLogicalIndexAtX(mouseX: number): number | null {
        const vp = this.viewport
        if (!vp || this.data.length === 0) return null
        const dpr = this.getEffectiveDpr()
        const { startXPx, unitPx } = getPhysicalKLineConfig(this.opt.kWidth, this.opt.kGap, dpr)
        const worldX = Math.round((vp.scrollLeft + mouseX) * dpr)
        const index = Math.floor((worldX - startXPx) / unitPx)
        if (index < 0) return null
        return index
    }

    /** 根据视口内 X 坐标反查数据索引（用于绘图落点） */
    getDataIndexAtX(mouseX: number): number | null {
        const index = this.getLogicalIndexAtX(mouseX)
        if (index === null || index >= this.data.length) return null
        return index
    }


    /** 获取内容总宽度（用于外部 scroll-content 撑开 scrollWidth） */
    getContentWidth(): number {
        return computeContentWidth({
            dataLength: this.data.length,
            kWidth: this.opt.kWidth,
            kGap: this.opt.kGap,
            viewWidth: this.viewport?.plotWidth ?? 0,
            viewportDpr: this.getEffectiveDpr(),
        })
    }


    /** 容器尺寸变化时调用 */
    resize() {
        const vp = this.computeViewport()
        // 防御性检查：容器尺寸无效时跳过布局
        if (!vp || vp.viewWidth < 10 || vp.viewHeight < 10) {
            return
        }
        this.layoutPanes()
        this.emitPaneLayoutChange()
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

        this.onViewportChange = undefined
        this.onPaneLayoutChange = undefined
        await this.pluginHost.destroy()
    }

    /** 初始化所有 pane */
    private initPanes() {
        this.paneRenderers = this.opt.panes.map((spec, index) => {
            const pane = new Pane(spec.id, {
                role: this.resolvePaneRole(spec, index),
                capabilities: spec.capabilities,
            })

            const plotCanvas = document.createElement('canvas')
            const yAxisCanvas = document.createElement('canvas')

            const isMain = pane.role === 'price'
            plotCanvas.id = `${spec.id}-plot`
            plotCanvas.className = isMain ? 'plot-canvas main' : 'plot-canvas sub'
            plotCanvas.style.position = 'absolute'
            plotCanvas.style.left = '0'
            plotCanvas.style.top = '0'

            yAxisCanvas.id = `${spec.id}-yAxis`
            yAxisCanvas.className = 'right-axis'
            yAxisCanvas.style.position = 'absolute'
            yAxisCanvas.style.left = '0'

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
        const rightAxisLayer = this.dom.rightAxisLayer
        if (canvasLayer) {
            const existingCanvases = canvasLayer.querySelectorAll('canvas:not(.x-axis-canvas)')
            existingCanvases.forEach((canvas) => canvas.remove())
        }
        if (rightAxisLayer) {
            const existingAxisCanvases = rightAxisLayer.querySelectorAll('canvas.right-axis')
            existingAxisCanvases.forEach((canvas) => canvas.remove())
        }

        this.paneRenderers.forEach((renderer) => {
            const dom = renderer.getDom()
            canvasLayer.appendChild(dom.plotCanvas)
            rightAxisLayer.appendChild(dom.yAxisCanvas)
        })

        this.rendererPluginManager.setKnownPaneIds(this.paneRenderers.map((renderer) => renderer.getPane().id))
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
        const fallback = this.opt.defaultPaneMinHeightPx ?? 120 // 最小高度
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
            pane.setPadding(this.opt.yPaddingPx, this.opt.yPaddingPx)

            renderer.resize(vp.plotWidth, h, vp.dpr)
            this.rendererPluginManager.notifyResize(pane.id, wrapPaneInfo(pane))
            const dom = renderer.getDom()
            dom.plotCanvas.style.top = `${y}px`
            dom.yAxisCanvas.style.top = `${y}px`
            dom.yAxisCanvas.style.left = '0px'

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

        const plotWidth = Math.round(viewWidth)
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
