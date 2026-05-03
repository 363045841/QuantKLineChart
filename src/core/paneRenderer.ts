export type PaneRendererDom = {
    plotCanvas: HTMLCanvasElement
    yAxisCanvas: HTMLCanvasElement
}

export type PaneRendererOptions = {
    rightAxisWidth: number
    yPaddingPx: number
    priceLabelWidth?: number
}

/**
 * PaneRenderer：负责单个 Pane 的 Canvas 管理
 * 渲染逻辑由 Chart 通过 RendererPluginManager 统一调度
 */
export class PaneRenderer {
    private dom: PaneRendererDom
    private pane: import('./layout/pane').Pane
    private opt: PaneRendererOptions

    constructor(dom: PaneRendererDom, pane: import('./layout/pane').Pane, opt: PaneRendererOptions) {
        this.dom = dom
        this.pane = pane
        this.opt = {
            ...opt,
            priceLabelWidth: opt.priceLabelWidth || 60,
        }
    }

    /** 获取关联的 Pane 实例 */
    getPane(): import('./layout/pane').Pane {
        return this.pane
    }

    /** 获取 DOM 元素 */
    getDom(): PaneRendererDom {
        return this.dom
    }

    /**
     * 调整 Canvas 尺寸
     * @param width pane 宽度（逻辑像素）
     * @param height pane 高度（逻辑像素）
     * @param dpr 设备像素比
     */
    resize(width: number, height: number, dpr: number) {
        const plotCanvas = this.dom.plotCanvas
        const yAxisCanvas = this.dom.yAxisCanvas

        plotCanvas.width = Math.round(width * dpr)
        plotCanvas.height = Math.round(height * dpr)
        plotCanvas.style.width = `${plotCanvas.width / dpr}px`
        plotCanvas.style.height = `${plotCanvas.height / dpr}px`

        const canvasYAxisWidth = this.opt.rightAxisWidth + (this.opt.priceLabelWidth || 60)
        yAxisCanvas.width = Math.round(canvasYAxisWidth * dpr)
        yAxisCanvas.height = Math.round(height * dpr)
        yAxisCanvas.style.width = `${yAxisCanvas.width / dpr}px`
        yAxisCanvas.style.height = `${yAxisCanvas.height / dpr}px`
    }

    /** 销毁 PaneRenderer 实例 */
    destroy() {
        // 无需清理的资源
    }
}
