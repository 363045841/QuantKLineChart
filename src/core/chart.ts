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
export type PaneSpec = { id: string; ratio: number; visible?: boolean }

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

    /** 插件宿主 */
    private pluginHost: PluginHostImpl

    /** 渲染器插件管理器 */
    private rendererPluginManager: RendererPluginManager

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

        this.initPanes()
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
        if (!vp) {
            console.log('[Chart] draw aborted: no viewport')
            return
        }

        // 数据为空时跳过渲染
        if (this.data.length === 0) {
            console.log('[Chart] draw aborted: no data')
            return
        }

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
                pane: { id: 'xAxis', top: 0, height: this.opt.bottomAxisHeight, yAxis: { priceToY: () => 0, yToPrice: () => 0, getPaddingTop: () => 0, getPaddingBottom: () => 0 }, priceRange: { maxPrice: 0, minPrice: 0 } },
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
     * 更新 pane 布局配置
     * @param panes 新的 pane 配置数组
     */
    updatePaneLayout(panes: PaneSpec[]): void {
        this.opt.panes = panes
        this.layoutPanes()
        this.scheduleDraw()
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
        console.log('[Chart] updateData called, data length:', data?.length)
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
        const dpr = this.viewport?.dpr || window.devicePixelRatio || 1
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
        this.viewport = null
        this.paneRenderers.forEach((r) => r.destroy())
        this.paneRenderers = []

        // 清理渲染器插件管理器（会调用所有 onUninstall）
        this.rendererPluginManager.clear()

        this.onZoomChange = undefined
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

    /** 计算每个 pane 的布局（top 和 height） */
    private layoutPanes() {
        const vp = this.viewport
        if (!vp) return

        // 过滤出可见的 pane
        const visibleSpecs = this.opt.panes.filter(p => p.visible !== false)
        const gap = Math.max(0, this.opt.paneGap ?? 0)
        let y = 0

        const totalGaps = gap * Math.max(0, visibleSpecs.length - 1)
        const availableH = Math.max(1, vp.plotHeight - totalGaps)

        // 指数退避 + 副图等分策略
        // 主图比例随副图数量递减，参考 TradingView 行为
        // subCount=0: 100%, subCount=1: 85%, subCount=2: 72%, subCount=3: 61%...
        const DECAY_FACTOR = 0.85

        const subCount = Math.max(0, visibleSpecs.length - 1)
        const mainRatio = subCount === 0 ? 1.0 : Math.pow(DECAY_FACTOR, subCount)
        const subRatioEach = subCount > 0 ? (1 - mainRatio) / subCount : 0

        // 计算每个 pane 的高度
        const paneHeights: number[] = visibleSpecs.map((spec, i) => {
            const isFirst = i === 0
            const ratio = isFirst ? mainRatio : subRatioEach
            return Math.round(availableH * ratio)
        })

        // 修正最后一个 pane 的高度，确保总和等于 availableH（消除舍入误差）
        const totalHeight = paneHeights.reduce((s, h) => s + h, 0)
        const lastPaneHeightIndex = paneHeights.length - 1
        if (lastPaneHeightIndex >= 0) {
            paneHeights[lastPaneHeightIndex]! += availableH - totalHeight
        }

        for (let i = 0; i < visibleSpecs.length; i++) {
            const spec = visibleSpecs[i]
            if (!spec) continue

            const renderer = this.paneRenderers.find(r => r.getPane().id === spec.id)
            if (!renderer) continue

            const pane = renderer.getPane()
            const h = paneHeights[i]!

            pane.setLayout(y, h)
            // 副图（非 main）不设置 padding，主图使用配置的 yPaddingPx
            if (pane.id !== 'main') {
                pane.setPadding(0, 0)
            } else {
                pane.setPadding(this.opt.yPaddingPx, this.opt.yPaddingPx)
            }

            renderer.resize(vp.plotWidth, h, vp.dpr)
            const dom = renderer.getDom()
            // 只设置 top，left/right 由 CSS 自动处理
            dom.plotCanvas.style.top = `${y}px`
            dom.yAxisCanvas.style.top = `${y}px`

            y += h + gap
        }
    }

    /** 计算并应用 viewport */
    private computeViewport(): Viewport | null {
        const container = this.dom.container
        if (!container) return null

        // 使用 clientWidth/clientHeight 而非 getBoundingClientRect()
        // 原因：getBoundingClientRect() 受 CSS transform 影响
        // 当父容器有 scale/rotate 等 transform 时会返回错误的尺寸
        const viewWidth = Math.max(1, Math.ceil(container.clientWidth))
        const viewHeight = Math.max(1, Math.ceil(container.clientHeight))
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

        // xAxisCanvas: 只设置宽度，位置由 CSS bottom: 0 自动处理
        // 注意：CSS 宽度和 canvas 像素宽度比例必须等于 dpr，否则文本会模糊
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
        return vp
    }
}
