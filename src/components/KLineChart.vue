<template>
  <div class="chart-wrapper">
    <div
      class="chart-container"
      :class="{ 'is-dragging': isDragging }"
      ref="containerRef"
      @scroll.passive="onScroll"
      @mousedown="onMouseDown"
      @mousemove="onMouseMove"
      @mouseup="onMouseUp"
      @mouseleave="onMouseLeave"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointerleave="onPointerLeave"
    >
      <!-- scroll-content 负责撑开横向滚动宽度，并承载 sticky 的画布层 -->
      <div class="scroll-content" :style="{ width: totalWidth + 'px' }">
        <!-- 画布层：sticky 固定在可视区域左上角，滚动只影响绘制时的 scrollLeft -->
        <div class="canvas-layer" ref="canvasLayerRef">
          <!-- plotCanvas 和 yAxisCanvas 由 Chart 自动创建 -->

          <!-- 底部时间轴（随 X 滚动，但画布不移动） -->
          <canvas class="x-axis-canvas" ref="xAxisCanvasRef"></canvas>

          <!-- 悬浮浮窗：放在 sticky 的 canvas-layer 内，避免随 scroll-content 横向滚动而偏移 -->
          <KLineTooltip
            v-if="hovered"
            :k="hovered"
            :index="hoveredIndex"
            :data="props.data"
            :pos="tooltipPos"
            :set-el="setTooltipEl"
          />
          <MarkerTooltip
            v-if="hoveredMarker"
            :marker="hoveredMarker"
            :pos="mousePos"
          />
        </div>
      </div>
    </div>
    <IndicatorSelector
      :active-indicators="activeIndicators"
      :indicator-params="indicatorParams"
      @toggle="handleIndicatorToggle"
      @update-params="handleUpdateParams"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick, shallowRef } from 'vue'
import type { KLineData } from '@/types/price'
import type { MarkerEntity } from '@/core/marker/registry'
import KLineTooltip from './KLineTooltip.vue'
import MarkerTooltip from './MarkerTooltip.vue'
import IndicatorSelector from './IndicatorSelector.vue'
import { Chart, type PaneSpec } from '@/core/chart'
import { getPhysicalKLineConfig } from '@/core/utils/klineConfig'
import { createCandleRenderer } from '@/core/renderers/candle'
import { createGridLinesRendererPlugin } from '@/core/renderers/gridLines'
import { createLastPriceLineRendererPlugin } from '@/core/renderers/lastPrice'
import {
  createMARendererPlugin,
  createMALegendRendererPlugin,
  createBOLLRendererPlugin,
  createBOLLLegendRendererPlugin,
  createSubIndicatorRenderer,
  type SubIndicatorType,
  getMACDTitleInfo,
  getRSITitleInfo,
  getCCITitleInfo,
  getSTOCHTitleInfo,
  getMOMTitleInfo,
  getWMSRTitleInfo,
  getKSTTitleInfo,
  getFASTKTitleInfo,
} from '@/core/renderers/Indicator'
import { createExtremaMarkersRendererPlugin } from '@/core/renderers/extremaMarkers'
import { createYAxisRendererPlugin } from '@/core/renderers/yAxis'
import { createTimeAxisRendererPlugin } from '@/core/renderers/timeAxis'
import { createCrosshairRendererPlugin } from '@/core/renderers/crosshair'
import { createGlobalBordersRendererPlugin } from '@/core/renderers/globalBorders'
import { createPaneTitleRendererPlugin, type TitleInfo } from '@/core/renderers/paneTitle'

type MAFlags = {
  ma5?: boolean
  ma10?: boolean
  ma20?: boolean
  ma30?: boolean
  ma60?: boolean
}

const props = withDefaults(
  defineProps<{
    data: KLineData[]
    kWidth?: number
    kGap?: number
    yPaddingPx?: number
    showMA?: MAFlags
    autoScrollToRight?: boolean
    minKWidth?: number
    maxKWidth?: number
    /** 右侧价格轴宽度 */
    rightAxisWidth?: number
    /** 底部时间轴高度 */
    bottomAxisHeight?: number
    /** 价格标签额外宽度（用于显示涨跌幅，默认 60px） */
    priceLabelWidth?: number

    /** Pane 高度比例（主/副），默认 [0.85, 0.15] */
    paneRatios?: [number, number]
  }>(),
  {
    kWidth: 10,
    kGap: 2,
    yPaddingPx: 0,
    showMA: () => ({ ma5: true, ma10: true, ma20: true, ma30: true, ma60: true }),
    autoScrollToRight: true,
    minKWidth: 2,
    maxKWidth: 50,
    rightAxisWidth: 70,
    bottomAxisHeight: 24,
    priceLabelWidth: 60,

    paneRatios: () => [0.75, 0.25],
  },
)

const xAxisCanvasRef = ref<HTMLCanvasElement | null>(null)
const canvasLayerRef = ref<HTMLDivElement | null>(null)
const containerRef = ref<HTMLDivElement | null>(null)

// 内部动态K线宽度和间隙
const currentKWidth = ref(props.kWidth)
const currentKGap = ref(props.kGap)

/* ========== 十字线（鼠标悬停位置） ========== */
const chartRef = shallowRef<Chart | null>(null)

function scheduleRender() {
  chartRef.value?.scheduleDraw()
}

function setTooltipEl(el: HTMLDivElement | null) {
  if (!el) return
  const r = el.getBoundingClientRect()
  chartRef.value?.interaction.setTooltipSize({
    width: Math.max(180, Math.round(r.width)),
    height: Math.max(80, Math.round(r.height)),
  })
}

// ===== Marker tooltip 状态 =====
const hoveredMarker = ref<MarkerEntity | null>(null)
const mousePos = ref({ x: 0, y: 0 })

// ===== 交互状态（先保留最小：拖拽时样式） =====
const isDragging = ref(false)

// tooltip/hover 必须是 Vue 可追踪的响应式状态（Chart 内部普通属性 Vue 不会自动追踪）
const hoveredIdx = ref<number | null>(null)
const crosshairIdx = ref<number | null>(null)
const tooltipPosition = ref({ x: 0, y: 0 })

const hovered = computed(() => {
  const idx = hoveredIdx.value
  if (typeof idx !== 'number') return null
  return props.data?.[idx] ?? null
})
const hoveredIndex = computed(() => hoveredIdx.value)
const tooltipPos = computed(() => tooltipPosition.value)

function syncHoverState() {
  const interaction = chartRef.value?.interaction
  if (!interaction) {
    hoveredIdx.value = null
    crosshairIdx.value = null
    hoveredMarker.value = null
    return
  }

  hoveredIdx.value = interaction.hoveredIndex ?? null
  crosshairIdx.value = interaction.crosshairIndex ?? null
  hoveredMarker.value = (interaction as any).hoveredMarkerData ?? null

  const pos = interaction.tooltipPos
  if (pos) tooltipPosition.value = { x: pos.x, y: pos.y }
}

function onMouseDown(e: MouseEvent) {
  isDragging.value = true
  chartRef.value?.interaction.onMouseDown(e)
  syncHoverState()
}

function onPointerDown(e: PointerEvent) {
  // 触屏：手指一接触屏幕就触发十字线（避免必须长按才触发）
  isDragging.value = true
  chartRef.value?.interaction.onPointerDown(e)
  syncHoverState()
}

function onMouseMove(e: MouseEvent) {
  const container = containerRef.value
  if (container) {
    const rect = container.getBoundingClientRect()
    mousePos.value = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    }
  }
  chartRef.value?.interaction.onMouseMove(e)
  syncHoverState()
}

function onPointerMove(e: PointerEvent) {
  const container = containerRef.value
  if (container) {
    const rect = container.getBoundingClientRect()
    mousePos.value = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    }
  }
  chartRef.value?.interaction.onPointerMove(e)
  syncHoverState()
}

function onMouseUp() {
  isDragging.value = false
  chartRef.value?.interaction.onMouseUp()
  syncHoverState()
}

function onPointerUp(e: PointerEvent) {
  isDragging.value = false
  chartRef.value?.interaction.onPointerUp(e)
  syncHoverState()
}

function onMouseLeave() {
  isDragging.value = false
  chartRef.value?.interaction.onMouseLeave()
  hoveredIdx.value = null
}

function onPointerLeave(e: PointerEvent) {
  isDragging.value = false
  chartRef.value?.interaction.onPointerLeave(e)
  hoveredIdx.value = null
}

function onScroll() {
  chartRef.value?.interaction.onScroll()
  syncHoverState()
}

// 指标选择器状态
const activeIndicators = ref<string[]>(['MA'])

// 指标参数配置
const indicatorParams = ref<Record<string, Record<string, number>>>({})

// 副图槽位状态
interface SubPaneSlot {
  id: string                  // pane ID: 'sub_0', 'sub_1', ...
  indicatorId: SubIndicatorType
  rendererName: string
  paneTitleRendererName: string  // paneTitle 渲染器名称
  params: Record<string, number>
}

// 副图槽位数组（支持多副图）
const subPanes = ref<SubPaneSlot[]>([])

// 最大副图数量
const maxSubPanes = 4

// 副图指标列表
const SUB_PANE_INDICATORS: SubIndicatorType[] = ['VOLUME', 'MACD', 'RSI', 'CCI', 'STOCH', 'MOM', 'WMSR', 'KST', 'FASTK']

// 布局配置（ratio 由 Chart 内部的指数退避策略计算，此处仅提供 pane 顺序）
const layoutPanes = computed<PaneSpec[]>(() => {
  if (subPanes.value.length === 0) {
    return [{ id: 'main', ratio: 1, visible: true }]
  }
  return [
    { id: 'main', ratio: 1, visible: true },
    ...subPanes.value.map(pane => ({ id: pane.id, ratio: 1, visible: true }))
  ]
})

// 监听布局变化，更新 Chart
watch(layoutPanes, (newPanes) => {
  chartRef.value?.updatePaneLayout(newPanes)
}, { flush: 'post' })

// 获取指标默认参数
function getDefaultParams(indicatorId: SubIndicatorType): Record<string, number> {
  switch (indicatorId) {
    case 'MACD': return { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 }
    case 'RSI': return { period1: 6, period2: 12, period3: 24 }
    case 'CCI': return { period: 14 }
    case 'STOCH': return { n: 9, m: 3 }
    case 'MOM': return { period: 10 }
    case 'WMSR': return { period: 14 }
    case 'KST': return { roc1: 10, roc2: 15, roc3: 20, roc4: 30, signalPeriod: 9 }
    case 'FASTK': return { period: 9 }
    default: return {}
  }
}

// 添加副图
function addSubPane(indicatorId: SubIndicatorType = 'VOLUME'): boolean {
  if (subPanes.value.length >= maxSubPanes) {
    return false
  }

  const paneId = `sub_${Date.now()}`
  const renderer = createSubIndicatorRenderer({ indicatorId, paneId })

  // 先添加 pane
  chartRef.value?.addPane(paneId)

  // 注册指标渲染器
  chartRef.value?.useRenderer(renderer)

  // 创建 paneTitle 渲染器
  const paneTitleRenderer = createPaneTitleRendererPlugin({
    paneId,
    title: indicatorId,
    getTitleInfo: () => getSubPaneTitleInfo(paneId)
  })
  chartRef.value?.useRenderer(paneTitleRenderer)

  // 更新状态
  subPanes.value.push({
    id: paneId,
    indicatorId,
    rendererName: renderer.name,
    paneTitleRendererName: paneTitleRenderer.name,
    params: getDefaultParams(indicatorId)
  })

  // 更新 activeIndicators
  if (!activeIndicators.value.includes(indicatorId)) {
    activeIndicators.value.push(indicatorId)
  }

  return true
}

// 移除副图
function removeSubPane(paneId: string): void {
  const index = subPanes.value.findIndex(p => p.id === paneId)
  if (index === -1) return

  const pane = subPanes.value[index]
  if (!pane) return

  // 注销指标渲染器
  chartRef.value?.removeRenderer(pane.rendererName)

  // 注销 paneTitle 渲染器
  chartRef.value?.removeRenderer(pane.paneTitleRendererName)

  // 移除 pane
  chartRef.value?.removePane(paneId)

  // 更新状态
  const indicatorId = pane.indicatorId
  subPanes.value.splice(index, 1)

  // 更新 activeIndicators
  const hasOtherPane = subPanes.value.some(p => p.indicatorId === indicatorId)
  if (!hasOtherPane) {
    activeIndicators.value = activeIndicators.value.filter(id => id !== indicatorId)
  }
}

// 切换副图指标
function switchSubIndicator(paneId: string, newIndicatorId: SubIndicatorType): void {
  const pane = subPanes.value.find(p => p.id === paneId)
  if (!pane) return

  // 注销旧渲染器
  chartRef.value?.removeRenderer(pane.rendererName)

  // 创建新渲染器
  const renderer = createSubIndicatorRenderer({ indicatorId: newIndicatorId, paneId })
  chartRef.value?.useRenderer(renderer)

  // 更新状态
  pane.indicatorId = newIndicatorId
  pane.rendererName = renderer.name
  pane.params = getDefaultParams(newIndicatorId)

  // 更新 activeIndicators
  if (!activeIndicators.value.includes(newIndicatorId)) {
    activeIndicators.value.push(newIndicatorId)
  }
}

// 获取副图标题信息
function getSubPaneTitleInfo(paneId: string): TitleInfo | null {
  const pane = subPanes.value.find(p => p.id === paneId)
  if (!pane) return null

  const data = props.data
  if (!data || data.length === 0) return null

  const p = pane.params

  // VOLUME 不依赖十字线，始终显示
  if (pane.indicatorId === 'VOLUME') {
    return { name: 'VOL', params: [], values: [] }
  }

  // 其他指标需要十字线位置
  const index = crosshairIdx.value
  if (index === null) return null

  switch (pane.indicatorId) {
    case 'MACD':
      return getMACDTitleInfo(data, index, p.fastPeriod ?? 12, p.slowPeriod ?? 26, p.signalPeriod ?? 9)
    case 'RSI':
      return getRSITitleInfo(data, index, p.period1 ?? 6, p.period2 ?? 12, p.period3 ?? 24)
    case 'CCI':
      return getCCITitleInfo(data, index, p.period ?? 14)
    case 'STOCH':
      return getSTOCHTitleInfo(data, index, p.n ?? 9, p.m ?? 3)
    case 'MOM':
      return getMOMTitleInfo(data, index, p.period ?? 10)
    case 'WMSR':
      return getWMSRTitleInfo(data, index, p.period ?? 14)
    case 'KST':
      return getKSTTitleInfo(data, index, p.roc1 ?? 10, p.roc2 ?? 15, p.roc3 ?? 20, p.roc4 ?? 30, p.signalPeriod ?? 9)
    case 'FASTK':
      return getFASTKTitleInfo(data, index, p.period ?? 9)
    default:
      return null
  }
}

// 指标切换处理
function handleIndicatorToggle(indicatorId: string, active: boolean) {
  // 主图指标处理
  if (indicatorId === 'MA') {
    if (active) {
      if (!activeIndicators.value.includes(indicatorId)) {
        activeIndicators.value.push(indicatorId)
      }
      chartRef.value?.updateRendererConfig('ma', {
        ma5: true, ma10: true, ma20: true, ma30: true, ma60: true
      })
      chartRef.value?.setRendererEnabled('maLegend', true)
    } else {
      activeIndicators.value = activeIndicators.value.filter(id => id !== indicatorId)
      chartRef.value?.updateRendererConfig('ma', {
        ma5: false, ma10: false, ma20: false, ma30: false, ma60: false
      })
      chartRef.value?.setRendererEnabled('maLegend', false)
    }
    scheduleRender()
    return
  }

  if (indicatorId === 'BOLL') {
    if (active) {
      if (!activeIndicators.value.includes(indicatorId)) {
        activeIndicators.value.push(indicatorId)
      }
    } else {
      activeIndicators.value = activeIndicators.value.filter(id => id !== indicatorId)
    }
    chartRef.value?.setRendererEnabled('boll', active)
    chartRef.value?.setRendererEnabled('bollLegend', active)
    scheduleRender()
    return
  }

  // 副图指标处理
  if (SUB_PANE_INDICATORS.includes(indicatorId as SubIndicatorType)) {
    if (active) {
      // 检查是否已有该指标的 pane
      const existingPane = subPanes.value.find(p => p.indicatorId === indicatorId)
      if (existingPane) {
        // 已存在，无需再添加
        return
      }

      // 尝试添加新副图
      if (!addSubPane(indicatorId as SubIndicatorType)) {
        // 达到上限，替换最后一个
        const lastPane = subPanes.value[subPanes.value.length - 1]
        if (lastPane) {
          switchSubIndicator(lastPane.id, indicatorId as SubIndicatorType)
        }
      }
    } else {
      // 找到并移除该指标的所有 pane
      const panesToRemove = subPanes.value.filter(p => p.indicatorId === indicatorId)
      panesToRemove.forEach(pane => removeSubPane(pane.id))
    }
    scheduleRender()
  }
}

// 指标参数更新处理
function handleUpdateParams(indicatorId: string, params: Record<string, number>) {
  // 保存参数配置
  indicatorParams.value[indicatorId] = params

  // 主图指标参数更新
  if (indicatorId === 'BOLL') {
    chartRef.value?.updateRendererConfig('boll', params)
    chartRef.value?.updateRendererConfig('bollLegend', params)
    scheduleRender()
    return
  }

  // 副图指标参数更新
  if (SUB_PANE_INDICATORS.includes(indicatorId as SubIndicatorType)) {
    // 更新所有使用该指标的 pane
    subPanes.value
      .filter(p => p.indicatorId === indicatorId)
      .forEach(pane => {
        pane.params = { ...params }
        chartRef.value?.updateRendererConfig(pane.rendererName, params)
      })
  }

  scheduleRender()
}

/* 计算总宽度：使用物理像素对齐后的值，确保与渲染一致 */
const totalWidth = computed(() => {
  const n = props.data?.length ?? 0
  const dpr = window.devicePixelRatio || 1

  // 使用物理像素对齐后的配置
  const { startXPx, unitPx } = getPhysicalKLineConfig(
    currentKWidth.value,
    currentKGap.value,
    dpr
  )

  // 实际需要的 plot 宽度（物理像素转回逻辑像素）
  const plotWidth = (startXPx + n * unitPx) / dpr
  const yAxisTotalWidth = props.rightAxisWidth + props.priceLabelWidth
  return plotWidth + yAxisTotalWidth
})

// 注意：缩放时由 Chart.setOnZoomChange 回调负责同步 kWidth/kGap + scrollLeft，避免重复 clamp。

function scrollToRight() {
  const container = containerRef.value
  if (!container) return
  container.scrollLeft = container.scrollWidth
  scheduleRender()
}

defineExpose({
  scheduleRender,
  scrollToRight,
  addSubPane,
  removeSubPane,
  switchSubIndicator,
  get plugin() {
    return chartRef.value?.plugin
  },
})

onMounted(() => {
  const container = containerRef.value
  const canvasLayer = canvasLayerRef.value
  const xAxisCanvas = xAxisCanvasRef.value
  if (!container || !canvasLayer || !xAxisCanvas) return

  // 手动添加 wheel 事件监听器，设置 passive: false 以允许 preventDefault()
  const onWheelHandler = (e: WheelEvent) => {
    chartRef.value?.interaction.onWheel(e)
    syncHoverState()
  }
  container.addEventListener('wheel', onWheelHandler, { passive: false })

  // 初始只有主图，副图通过 addSubPane 动态添加
  const chart = new Chart(
    { container, canvasLayer, xAxisCanvas },
    {
      kWidth: currentKWidth.value,
      kGap: currentKGap.value,
      yPaddingPx: props.yPaddingPx,
      rightAxisWidth: props.rightAxisWidth,
      bottomAxisHeight: props.bottomAxisHeight,
      priceLabelWidth: props.priceLabelWidth,
      minKWidth: props.minKWidth,
      maxKWidth: props.maxKWidth,
      panes: [{ id: 'main', ratio: 1 }],  // 初始只有主图

      // 主/副图之间真实留白，形成视觉断开
      paneGap: 0,
    },
  )

  // 缩放回调：同步 kWidth/kGap -> 等 DOM 更新 scrollWidth -> 再设置 scrollLeft -> 最后 applyZoom
  chart.setOnZoomChange(async (kWidth, kGap, targetScrollLeft) => {
    // 1) 先更新响应式变量，驱动 totalWidth 计算
    currentKWidth.value = kWidth
    currentKGap.value = kGap

    // 2) 等 Vue 更新 scroll-content 的 width
    await nextTick()
    // 3) 再等一帧，确保浏览器完成布局刷新 scrollWidth
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

    // 4) scrollLeft 落地
    const c = containerRef.value
    if (!c) return
    const maxScrollLeft = Math.max(0, c.scrollWidth - c.clientWidth)
    c.scrollLeft = Math.min(Math.max(0, targetScrollLeft), maxScrollLeft)

    // 5) scrollLeft 已落地，现在才让 Chart 更新 opt 并渲染
    //    这一帧看到的 (kWidth, kGap, scrollLeft) 是完全一致的
    chart.applyZoom(kWidth, kGap)
  })

  // 注册主图渲染器插件
  chart.useRenderer(createGridLinesRendererPlugin()) // 网格线渲染到所有 pane
  chart.useRenderer(createExtremaMarkersRendererPlugin())
  chart.useRenderer(createMARendererPlugin(props.showMA))
  chart.useRenderer(createBOLLRendererPlugin())
  chart.setRendererEnabled('boll', false) // 默认禁用，点击按钮启用
  chart.useRenderer(createCandleRenderer())
  chart.useRenderer(createLastPriceLineRendererPlugin())

  // 系统渲染器插件
  chart.useRenderer(createYAxisRendererPlugin({
    axisWidth: props.rightAxisWidth,
    yPaddingPx: props.yPaddingPx,
  }))
  chart.useRenderer(createMALegendRendererPlugin({
    yPaddingPx: props.yPaddingPx,
    showMA: props.showMA,
  }))
  chart.useRenderer(createBOLLLegendRendererPlugin({
    yPaddingPx: props.yPaddingPx,
  }))
  chart.setRendererEnabled('bollLegend', false) // 默认禁用，点击按钮启用

  chart.useRenderer(createCrosshairRendererPlugin({
    getCrosshairState: () => ({
      pos: chart.interaction.crosshairPos,
      activePaneId: chart.interaction.activePaneId,
      isDragging: chart.interaction.isDraggingState(),
    }),
  }))
  chart.useRenderer(createTimeAxisRendererPlugin({
    height: props.bottomAxisHeight,
    getCrosshair: () => {
      const pos = chart.interaction.crosshairPos
      const idx = chart.interaction.hoveredIndex
      if (pos && idx !== null) {
        return { x: pos.x, index: idx }
      }
      return null
    },
  }))
  chart.useRenderer(createGlobalBordersRendererPlugin({
    getPaneInfos: () => chart.getPaneRenderers().map(r => ({
      top: r.getPane().top,
      height: r.getPane().height,
    })),
  }))

  chartRef.value = chart
  chart.updateData(props.data)
  chart.resize()

  // 初始添加成交量副图
  addSubPane('VOLUME')

  // 注册 marker hover 回调
  chart.interaction.setOnMarkerHover((marker: MarkerEntity | null) => {
    hoveredMarker.value = marker
    scheduleRender()
  })

  const onResize = () => chart.resize()
  window.addEventListener('resize', onResize, { passive: true })

  // 绑定到实例上，unmount 时移除（通过闭包变量）
  ;(chart as any).__onResize = onResize
  ;(chart as any).__onWheel = onWheelHandler
})

onUnmounted(() => {
  const chart = chartRef.value
  if (chart) {
    const onResize = (chart as any).__onResize as ((this: Window, ev: UIEvent) => any) | undefined
    if (onResize) window.removeEventListener('resize', onResize)
    const onWheel = (chart as any).__onWheel as
      | ((this: HTMLElement, ev: WheelEvent) => any)
      | undefined
    const container = containerRef.value
    if (onWheel && container) container.removeEventListener('wheel', onWheel)
    chart.destroy()
  }
  chartRef.value = null
})

watch(
  () => [props.kWidth, props.kGap],
  ([newWidth, newGap]) => {
    if (typeof newWidth === 'number') currentKWidth.value = newWidth
    if (typeof newGap === 'number') currentKGap.value = newGap

    chartRef.value?.updateOptions({ kWidth: currentKWidth.value, kGap: currentKGap.value })
  },
)

watch(
  () => [props.data, props.yPaddingPx, props.showMA],
  async () => {
    chartRef.value?.updateOptions({ yPaddingPx: props.yPaddingPx })
    chartRef.value?.updateData(props.data)

    if (props.autoScrollToRight) {
      await nextTick()
      scrollToRight()
    } else {
      scheduleRender()
    }
  },
  { deep: true },
)
</script>

<style scoped>
.chart-wrapper {
  /* 让组件在父容器中居中显示 */
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  flex-direction: column;
}

.chart-container {
  position: relative;
  overflow-x: auto;
  overflow-y: hidden;
  height: 85%;
  width: 95%;
  scrollbar-width: none;
  -ms-overflow-style: none;

  /* ===== 移动端：屏蔽长按弹出菜单/选择等默认行为，避免影响交互 ===== */
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
  /* 禁止浏览器接管手势（如长按/双击缩放等），保留我们自定义的 pointer 拖拽/十字线逻辑 */
  touch-action: none;
}

.chart-container::-webkit-scrollbar {
  display: none;
}

.chart-container:hover {
  cursor: grab;
}

.chart-container:active {
  cursor: grabbing;
}

.scroll-content {
  height: 100%;
  min-height: inherit;
  position: relative;
}

/* 关键：sticky 固定在可视区域左上角 */
.canvas-layer {
  position: sticky;
  left: 0;
  top: 0;
  /* width/height 由 JS 在 render() 中设置为视口大小 */
  pointer-events: none;
}

/* 三层 canvas 叠放 */
.plot-canvas {
  position: absolute;
  left: 0;
  top: 0;
  display: block;
}

.y-axis-canvas {
  position: absolute;
  top: 0;
  right: 0;
  display: block;
}

.x-axis-canvas {
  position: absolute;
  left: 0;
  display: block;
  /* top 和 width 由 JS 动态设置 */
}
</style>
