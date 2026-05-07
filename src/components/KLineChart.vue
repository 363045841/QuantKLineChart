<template>
  <div class="chart-wrapper">
    <div
      class="chart-container"
      :class="{
        'is-dragging': isDragging,
        'is-resizing-pane': isResizingPane,
        'is-hovering-pane-separator': isHoveringPaneSeparator,
        'is-hovering-right-axis': isHoveringRightAxis,
      }"
      ref="containerRef"
      @scroll.passive="onScroll"
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

          <div
            v-if="hovered"
            class="tooltip-anchor kline-tooltip-anchor"
            :class="{ 'use-anchor': useAnchorPositioning }"
            :style="{ left: `${tooltipPos.x}px`, top: `${tooltipPos.y}px` }"
          ></div>
          <div
            v-if="hoveredMarker || hoveredCustomMarker"
            class="tooltip-anchor marker-tooltip-anchor"
            :class="{ 'use-anchor': useAnchorPositioning }"
            :style="{ left: `${mousePos.x}px`, top: `${mousePos.y}px` }"
          ></div>

          <!-- 悬浮浮窗：放在 sticky 的 canvas-layer 内，避免随 scroll-content 横向滚动而偏移 -->
          <KLineTooltip
            v-if="hovered"
            :k="hovered"
            :index="hoveredIndex"
            :data="chartData"
            :pos="tooltipPos"
            :set-el="setTooltipEl"
            :use-anchor="useAnchorPositioning"
            :anchor-placement="tooltipAnchorPlacement"
          />
          <MarkerTooltip
            v-if="hoveredMarker || hoveredCustomMarker"
            :marker="hoveredMarker || hoveredCustomMarker"
            :pos="mousePos"
            :use-anchor="useAnchorPositioning"
            :anchor-placement="markerTooltipAnchorPlacement"
            :set-el="setMarkerTooltipEl"
          />
        </div>
      </div>
    </div>
    <IndicatorSelector
      :active-indicators="activeIndicators"
      :indicator-params="indicatorParams"
      @toggle="handleIndicatorToggle"
      @update-params="handleUpdateParams"
      @reorder-sub-indicators="handleReorderSubIndicators"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick, shallowRef } from 'vue'
import type { MarkerEntity, CustomMarkerEntity } from '@/core/marker/registry'
import { SemanticChartController, type SemanticChartConfig } from '@/semantic'
import { createCustomMarkersRenderer } from '@/core/renderers/customMarkers'
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
  createBOLLRendererPlugin,
  createEXPMARendererPlugin,
  createENERendererPlugin,
  createMainIndicatorLegendRendererPlugin,
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
import { createMacdScaleRendererPlugin } from '@/core/renderers/Indicator/scale/macd_scale'
import { createRsiScaleRendererPlugin } from '@/core/renderers/Indicator/scale/rsi_scale'
import { createCciScaleRendererPlugin } from '@/core/renderers/Indicator/scale/cci_scale'
import { createStochScaleRendererPlugin } from '@/core/renderers/Indicator/scale/stoch_scale'
import { createMomScaleRendererPlugin } from '@/core/renderers/Indicator/scale/mom_scale'
import { createWmsrScaleRendererPlugin } from '@/core/renderers/Indicator/scale/wmsr_scale'
import { createKstScaleRendererPlugin } from '@/core/renderers/Indicator/scale/kst_scale'
import { createFastkScaleRendererPlugin } from '@/core/renderers/Indicator/scale/fastk_scale'
import { createTimeAxisRendererPlugin } from '@/core/renderers/timeAxis'
import { createCrosshairRendererPlugin } from '@/core/renderers/crosshair'
import { createPaneTitleRendererPlugin, type TitleInfo } from '@/core/renderers/paneTitle'

const props = withDefaults(
  defineProps<{
    /** 语义化配置（必需，唯一控制源） */
    semanticConfig: SemanticChartConfig

    kWidth?: number
    kGap?: number
    yPaddingPx?: number
    minKWidth?: number
    maxKWidth?: number
    /** 右侧价格轴宽度 */
    rightAxisWidth?: number
    /** 底部时间轴高度 */
    bottomAxisHeight?: number
    /** 价格标签额外宽度（用于显示涨跌幅，默认 60px） */
    priceLabelWidth?: number

    /** 缩放级别数量（默认 10） */
    zoomLevels?: number
    /** 初始缩放级别（1 ~ zoomLevels，默认居中） */
    initialZoomLevel?: number
  }>(),
  {
    kWidth: 10,
    kGap: 2,
    yPaddingPx: 0,
    minKWidth: 2,
    maxKWidth: 50,
    rightAxisWidth: 0,
    bottomAxisHeight: 24,
    priceLabelWidth: 60,
    zoomLevels: 10,
    initialZoomLevel: undefined,
  },
)

const xAxisCanvasRef = ref<HTMLCanvasElement | null>(null)
const canvasLayerRef = ref<HTMLDivElement | null>(null)
const containerRef = ref<HTMLDivElement | null>(null)

// 内部动态K线宽度和间隙
const currentKWidth = ref(props.kWidth)
const currentKGap = ref(props.kGap)

const emit = defineEmits<{
  (e: 'zoomLevelChange', level: number, kWidth: number): void
}>()

/* ========== 十字线（鼠标悬停位置） ========== */
const chartRef = shallowRef<Chart | null>(null)

/* ========== 语义化控制器 ========== */
const semanticController = shallowRef<SemanticChartController | null>(null)

/* ========== 数据长度（响应式，用于计算 totalWidth） ========== */
const dataLength = ref(0)
const viewportDpr = ref(1)

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

function setMarkerTooltipEl(el: HTMLDivElement | null) {
  if (!el) return
  const r = el.getBoundingClientRect()
  markerTooltipSize.value = {
    width: Math.max(120, Math.round(r.width)),
    height: Math.max(60, Math.round(r.height)),
  }
}

// ===== Marker tooltip 状态 =====
const hoveredMarker = ref<MarkerEntity | null>(null)
const hoveredCustomMarker = ref<CustomMarkerEntity | null>(null)
const mousePos = ref({ x: 0, y: 0 })
const useAnchorPositioning = ref(false)

// ===== 交互状态 =====
const isDragging = ref(false)
const isResizingPane = ref(false)
const isHoveringPaneSeparator = ref(false)
const isHoveringRightAxis = ref(false)

const paneRatios = ref<Record<string, number>>({ main: 3 })

// tooltip/hover 必须是 Vue 可追踪的响应式状态（Chart 内部普通属性 Vue 不会自动追踪）
const hoveredIdx = ref<number | null>(null)
const crosshairIdx = ref<number | null>(null)
const tooltipPosition = ref({ x: 0, y: 0 })
const tooltipAnchorPlacement = ref<'right-bottom' | 'left-bottom'>('right-bottom')
const markerTooltipSize = ref({ width: 220, height: 120 })

// 数据版本号，用于强制 chartData computed 重新求值
const dataVersion = ref(0)

const hovered = computed(() => {
  const idx = hoveredIdx.value
  if (typeof idx !== 'number') return null
  void dataVersion.value // 建立响应式依赖
  const data = chartRef.value?.getData()
  if (data && idx >= 0 && idx < data.length) {
    return data[idx]
  }
  return null
})
const hoveredIndex = computed(() => hoveredIdx.value)
const tooltipPos = computed(() => tooltipPosition.value)
const markerTooltipAnchorPlacement = computed<'right-bottom' | 'left-bottom'>(() => {
  const chart = chartRef.value
  const viewport = chart?.getViewport()
  const container = containerRef.value
  const plotWidth = viewport?.plotWidth ?? (container ? container.clientWidth : 0)
  const padding = 12
  const gap = 12
  const rightCandidateX = mousePos.value.x + gap
  const wouldOverflowRight = rightCandidateX + markerTooltipSize.value.width + padding > plotWidth
  return wouldOverflowRight ? 'left-bottom' : 'right-bottom'
})

// 获取当前图表数据
const chartData = computed(() => {
  void dataVersion.value // 建立响应式依赖，确保数据变化时重新求值
  return chartRef.value?.getData() ?? []
})

// 通知数据变化（在数据更新后调用）
function notifyDataChange() {
  dataVersion.value++
}

// RAF 节流：避免高频 pointermove 触发过多响应式更新
let hoverRafId: number | null = null

function syncPaneInteractionState() {
  const interaction = chartRef.value?.interaction
  if (!interaction) {
    isResizingPane.value = false
    isHoveringPaneSeparator.value = false
    isHoveringRightAxis.value = false
    return
  }
  isResizingPane.value = interaction.isResizingPaneBoundaryState()
  isHoveringPaneSeparator.value = interaction.isHoveringPaneBoundaryState()
  isHoveringRightAxis.value = interaction.isHoveringRightAxisState()
}

function syncHoverState() {
  const interaction = chartRef.value?.interaction
  if (!interaction) {
    hoveredIdx.value = null
    crosshairIdx.value = null
    hoveredMarker.value = null
    hoveredCustomMarker.value = null
    syncPaneInteractionState()
    return
  }

  hoveredIdx.value = interaction.hoveredIndex ?? null
  crosshairIdx.value = interaction.crosshairIndex ?? null
  hoveredMarker.value = (interaction as any).hoveredMarkerData ?? null
  hoveredCustomMarker.value = (interaction as any).hoveredCustomMarker ?? null

  const placement = interaction.tooltipAnchorPlacement
  if (placement) tooltipAnchorPlacement.value = placement

  const pos = interaction.tooltipPos
  if (pos) tooltipPosition.value = { x: pos.x, y: pos.y }

  syncPaneInteractionState()
}

// 节流版本：用于 pointermove 高频调用
function syncHoverStateThrottled() {
  if (hoverRafId) return
  hoverRafId = requestAnimationFrame(() => {
    syncHoverState()
    hoverRafId = null
  })
}

function onPointerDown(e: PointerEvent) {
  // 触屏：手指一接触屏幕就触发十字线（避免必须长按才触发）
  chartRef.value?.interaction.onPointerDown(e)
  isDragging.value = chartRef.value?.interaction.isDraggingState() ?? false
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
  syncHoverStateThrottled() // 使用节流版本避免高频更新
}

function onPointerUp(e: PointerEvent) {
  chartRef.value?.interaction.onPointerUp(e)
  isDragging.value = chartRef.value?.interaction.isDraggingState() ?? false
  syncHoverState()
}

function onPointerLeave(e: PointerEvent) {
  chartRef.value?.interaction.onPointerLeave(e)
  isDragging.value = chartRef.value?.interaction.isDraggingState() ?? false
  hoveredIdx.value = null
  syncPaneInteractionState()
}

function onScroll() {
  chartRef.value?.interaction.onScroll()
  syncHoverState()
}

// 指标选择器状态（由 semanticConfig 初始化）
const activeIndicators = ref<string[]>([])

// 指标参数配置（MA 的 periods 是数组，需要更宽松的类型）
const indicatorParams = ref<Record<string, Record<string, unknown>>>({})

// 副图槽位状态
interface SubPaneSlot {
  id: string // pane ID: 'sub_0', 'sub_1', ...
  indicatorId: SubIndicatorType
  rendererName: string
  paneTitleRendererName: string // paneTitle 渲染器名称
  params: Record<string, unknown>
}

// 副图槽位数组（支持多副图）
const subPanes = ref<SubPaneSlot[]>([])

// 最大副图数量
const maxSubPanes = 4

// 副图指标列表
const SUB_PANE_INDICATORS: SubIndicatorType[] = [
  'VOLUME',
  'MACD',
  'RSI',
  'CCI',
  'STOCH',
  'MOM',
  'WMSR',
  'KST',
  'FASTK',
]

function buildPaneLayoutIntent(): PaneSpec[] {
  const mainRatio = paneRatios.value['main'] ?? 3
  return subPanes.value.length === 0
    ? [{ id: 'main', ratio: mainRatio, visible: true, role: 'price' }]
    : [
        { id: 'main', ratio: mainRatio, visible: true, role: 'price' },
        ...subPanes.value.map((pane) => ({
          id: pane.id,
          ratio: paneRatios.value[pane.id] ?? 1,
          visible: true,
          role: 'indicator' as const,
        })),
      ]
}

// 获取指标默认参数
function getDefaultParams(indicatorId: SubIndicatorType): Record<string, number> {
  switch (indicatorId) {
    case 'MACD':
      return { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 }
    case 'RSI':
      return { period1: 6, period2: 12, period3: 24 }
    case 'CCI':
      return { period: 14 }
    case 'STOCH':
      return { n: 9, m: 3 }
    case 'MOM':
      return { period: 10 }
    case 'WMSR':
      return { period: 14 }
    case 'KST':
      return { roc1: 10, roc2: 15, roc3: 20, roc4: 30, signalPeriod: 9 }
    case 'FASTK':
      return { period: 9 }
    default:
      return {}
  }
}

// 添加副图（使用 Chart API）
function addSubPane(
  indicatorId: SubIndicatorType = 'VOLUME',
  params?: Record<string, number>,
): boolean {
  if (subPanes.value.length >= maxSubPanes) {
    return false
  }

  const paneId = `sub_${indicatorId}`

  // 已存在则跳过
  if (subPanes.value.some((p) => p.id === paneId)) {
    return true
  }

  // 使用 Chart API 创建副图（pane + 指标渲染器）
  const success = chartRef.value?.createSubPane(
    indicatorId,
    params ?? getDefaultParams(indicatorId),
  )
  if (!success) return false

  // 创建 paneTitle 渲染器（UI 层职责）
  const paneTitleRenderer = createPaneTitleRendererPlugin({
    paneId,
    title: indicatorId,
    getTitleInfo: () => getSubPaneTitleInfo(paneId),
  })
  chartRef.value?.useRenderer(paneTitleRenderer)

  // 更新本地状态
  subPanes.value.push({
    id: paneId,
    indicatorId,
    rendererName: `${indicatorId.toLowerCase()}_${paneId}`,
    paneTitleRendererName: paneTitleRenderer.name,
    params: params ?? getDefaultParams(indicatorId),
  })

  // 新增副图后，由 Chart 回流 ratio

  // 更新 activeIndicators
  if (!activeIndicators.value.includes(indicatorId)) {
    activeIndicators.value.push(indicatorId)
  }

  return true
}

// 移除副图（使用 Chart API）
function removeSubPane(paneId: string): void {
  const index = subPanes.value.findIndex((p) => p.id === paneId)
  if (index === -1) return

  const pane = subPanes.value[index]
  if (!pane) return

  // 移除 paneTitle 渲染器
  chartRef.value?.removeRenderer(pane.paneTitleRendererName)

  // 使用 Chart API 移除副图（pane + 指标渲染器）
  chartRef.value?.removeSubPane(pane.indicatorId)

  // 更新本地状态
  subPanes.value.splice(index, 1)

  // 移除副图后，由 Chart 回流 ratio

  // 更新 activeIndicators
  const hasOtherPane = subPanes.value.some((p) => p.indicatorId === pane.indicatorId)
  if (!hasOtherPane) {
    activeIndicators.value = activeIndicators.value.filter((id) => id !== pane.indicatorId)
  }
}

// 清除所有副图（使用 Chart API）
function clearAllSubPanes(): void {
  // 移除所有 paneTitle 渲染器
  for (const pane of subPanes.value) {
    chartRef.value?.removeRenderer(pane.paneTitleRendererName)
  }

  // 使用 Chart API 清除所有副图
  chartRef.value?.clearSubPanes()

  // 清空本地状态
  subPanes.value = []
  activeIndicators.value = activeIndicators.value.filter(
    (id) => !SUB_PANE_INDICATORS.includes(id as SubIndicatorType),
  )
}

// 从语义化配置初始化指标状态（单向数据流：config → state）
function initIndicatorsFromConfig(): void {
  const config = props.semanticConfig

  // 初始化主图指标
  const mainIndicators = config.indicators?.main
  if (mainIndicators) {
    for (const indicator of mainIndicators) {
      if (indicator.enabled) {
        if (!activeIndicators.value.includes(indicator.type)) {
          activeIndicators.value.push(indicator.type)
        }
        // 初始化参数
        if (indicator.params) {
          indicatorParams.value[indicator.type] = indicator.params as Record<string, unknown>
        }
      }
    }
  }

  // 副图指标参数由 syncSubPanesFromChart 处理
}

// 监听主图指标状态和参数变化，控制渲染器（单向数据流：state → chart）
watch(
  [activeIndicators, indicatorParams],
  ([indicators]) => {
    const chart = chartRef.value
    if (!chart) return

    // 更新 mainIndicatorLegend 渲染器配置
    chart.updateRendererConfig('mainIndicatorLegend', {
      indicators: {
        MA: {
          enabled: indicators.includes('MA'),
          params: indicatorParams.value['MA'] || {},
        },
        BOLL: {
          enabled: indicators.includes('BOLL'),
          params: indicatorParams.value['BOLL'] || {},
        },
        EXPMA: {
          enabled: indicators.includes('EXPMA'),
          params: indicatorParams.value['EXPMA'] || {},
        },
        ENE: {
          enabled: indicators.includes('ENE'),
          params: indicatorParams.value['ENE'] || {},
        },
      },
    })

    // MA 线渲染器
    chart.setRendererEnabled('ma', indicators.includes('MA'))

    // BOLL 线渲染器
    chart.setRendererEnabled('boll', indicators.includes('BOLL'))

    // EXPMA 线渲染器
    chart.setRendererEnabled('expma', indicators.includes('EXPMA'))

    // ENE 线渲染器
    chart.setRendererEnabled('ene', indicators.includes('ENE'))

    scheduleRender()
  },
  { deep: true },
)

// 从 Chart 同步副图状态到本地（语义化配置后调用）
function syncSubPanesFromChart(): void {
  const chartSubPanes = chartRef.value?.getSubPaneIndicators() ?? []

  // 清空本地状态
  subPanes.value = []

  for (const indicatorId of chartSubPanes) {
    const paneId = `sub_${indicatorId}`

    // 创建 paneTitle 渲染器
    const paneTitleRenderer = createPaneTitleRendererPlugin({
      paneId,
      title: indicatorId,
      getTitleInfo: () => getSubPaneTitleInfo(paneId),
    })
    chartRef.value?.useRenderer(paneTitleRenderer)

    // 更新本地状态
    subPanes.value.push({
      id: paneId,
      indicatorId,
      rendererName: `${indicatorId.toLowerCase()}_${paneId}`,
      paneTitleRendererName: paneTitleRenderer.name,
      params: getDefaultParams(indicatorId),
    })

    // 更新 activeIndicators
    if (!activeIndicators.value.includes(indicatorId)) {
      activeIndicators.value.push(indicatorId)
    }
  }
}

// 切换副图指标（使用 Chart API）
function switchSubIndicator(paneId: string, newIndicatorId: SubIndicatorType): void {
  const pane = subPanes.value.find((p) => p.id === paneId)
  if (!pane) return

  const oldIndicatorId = pane.indicatorId

  // 移除旧的 paneTitle 渲染器
  chartRef.value?.removeRenderer(pane.paneTitleRendererName)

  // 使用 Chart API 移除旧副图
  chartRef.value?.removeSubPane(oldIndicatorId)

  // 使用 Chart API 创建新副图
  chartRef.value?.createSubPane(newIndicatorId, getDefaultParams(newIndicatorId))

  // 创建新的 paneTitle 渲染器
  const newPaneId = `sub_${newIndicatorId}`
  const paneTitleRenderer = createPaneTitleRendererPlugin({
    paneId: newPaneId,
    title: newIndicatorId,
    getTitleInfo: () => getSubPaneTitleInfo(newPaneId),
  })
  chartRef.value?.useRenderer(paneTitleRenderer)

  // 更新本地状态
  const index = subPanes.value.findIndex((p) => p.id === paneId)
  if (index !== -1) {
    subPanes.value[index] = {
      id: newPaneId,
      indicatorId: newIndicatorId,
      rendererName: `${newIndicatorId.toLowerCase()}_${newPaneId}`,
      paneTitleRendererName: paneTitleRenderer.name,
      params: getDefaultParams(newIndicatorId),
    }
  }

  // 更新 activeIndicators：移除旧指标，添加新指标
  activeIndicators.value = activeIndicators.value.filter((id) => id !== oldIndicatorId)
  if (!activeIndicators.value.includes(newIndicatorId)) {
    activeIndicators.value.push(newIndicatorId)
  }
}

// 获取副图标题信息
function getSubPaneTitleInfo(paneId: string): TitleInfo | null {
  const pane = subPanes.value.find((p) => p.id === paneId)
  if (!pane) return null

  const data = chartRef.value?.getData()
  if (!data || data.length === 0) return null

  const p = pane.params as Record<string, number>

  // VOLUME 不依赖十字线，始终显示
  if (pane.indicatorId === 'VOLUME') {
    return { name: 'VOL', params: [], values: [] }
  }

  // 其他指标需要十字线位置
  const index = crosshairIdx.value
  if (index === null) return null

  switch (pane.indicatorId) {
    case 'MACD':
      return getMACDTitleInfo(
        data,
        index,
        p.fastPeriod ?? 12,
        p.slowPeriod ?? 26,
        p.signalPeriod ?? 9,
      )
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
      return getKSTTitleInfo(
        data,
        index,
        p.roc1 ?? 10,
        p.roc2 ?? 15,
        p.roc3 ?? 20,
        p.roc4 ?? 30,
        p.signalPeriod ?? 9,
      )
    case 'FASTK':
      return getFASTKTitleInfo(data, index, p.period ?? 9)
    default:
      return null
  }
}

// 指标切换处理（只更新状态，渲染器由 watch 控制）
function handleIndicatorToggle(indicatorId: string, active: boolean) {
  // 主图指标处理
  if (
    indicatorId === 'MA' ||
    indicatorId === 'BOLL' ||
    indicatorId === 'EXPMA' ||
    indicatorId === 'ENE'
  ) {
    if (active) {
      if (!activeIndicators.value.includes(indicatorId)) {
        activeIndicators.value.push(indicatorId)
      }
    } else {
      activeIndicators.value = activeIndicators.value.filter((id) => id !== indicatorId)
    }
    // 渲染器状态由 watch activeIndicators 控制
    return
  }

  // 副图指标处理
  if (SUB_PANE_INDICATORS.includes(indicatorId as SubIndicatorType)) {
    if (active) {
      // 更新 activeIndicators 状态
      if (!activeIndicators.value.includes(indicatorId)) {
        activeIndicators.value.push(indicatorId)
      }

      // 检查是否已有该指标的 pane
      const existingPane = subPanes.value.find((p) => p.indicatorId === indicatorId)
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
      // 更新 activeIndicators 状态
      activeIndicators.value = activeIndicators.value.filter((id) => id !== indicatorId)

      // 找到并移除该指标的所有 pane
      const panesToRemove = subPanes.value.filter((p) => p.indicatorId === indicatorId)
      panesToRemove.forEach((pane) => removeSubPane(pane.id))
    }
    scheduleRender()
  }
}

// 更新主图指标图例配置
function updateMainIndicatorLegendConfig() {
  chartRef.value?.updateRendererConfig('mainIndicatorLegend', {
    indicators: {
      MA: {
        enabled: activeIndicators.value.includes('MA'),
        params: indicatorParams.value['MA'] || {},
      },
      BOLL: {
        enabled: activeIndicators.value.includes('BOLL'),
        params: indicatorParams.value['BOLL'] || {},
      },
      EXPMA: {
        enabled: activeIndicators.value.includes('EXPMA'),
        params: indicatorParams.value['EXPMA'] || {},
      },
      ENE: {
        enabled: activeIndicators.value.includes('ENE'),
        params: indicatorParams.value['ENE'] || {},
      },
    },
  })
}

// 指标参数更新处理
function handleUpdateParams(indicatorId: string, params: Record<string, unknown>) {
  // 保存参数配置
  indicatorParams.value[indicatorId] = params

  // 主图指标参数更新
  if (
    indicatorId === 'MA' ||
    indicatorId === 'BOLL' ||
    indicatorId === 'EXPMA' ||
    indicatorId === 'ENE'
  ) {
    // BOLL 渲染器配置
    if (indicatorId === 'BOLL') {
      chartRef.value?.updateRendererConfig('boll', params)
    }
    // EXPMA 渲染器配置
    if (indicatorId === 'EXPMA') {
      chartRef.value?.updateRendererConfig('expma', params)
    }
    // ENE 渲染器配置
    if (indicatorId === 'ENE') {
      chartRef.value?.updateRendererConfig('ene', params)
    }
    // 更新图例以显示新参数
    updateMainIndicatorLegendConfig()
    scheduleRender()
    return
  }

  // 副图指标参数更新
  if (SUB_PANE_INDICATORS.includes(indicatorId as SubIndicatorType)) {
    // 更新所有使用该指标的 pane
    subPanes.value
      .filter((p) => p.indicatorId === indicatorId)
      .forEach((pane) => {
        pane.params = { ...params }
        chartRef.value?.updateRendererConfig(pane.rendererName, params)
      })
  }

  scheduleRender()
}

function handleReorderSubIndicators(orderedIndicatorIds: string[]) {
  if (!orderedIndicatorIds.length || subPanes.value.length <= 1) return

  const validOrder = orderedIndicatorIds.filter((id): id is SubIndicatorType =>
    SUB_PANE_INDICATORS.includes(id as SubIndicatorType),
  )
  if (!validOrder.length) return

  const paneByIndicator = new Map(subPanes.value.map((pane) => [pane.indicatorId, pane] as const))
  const nextSubPanes: SubPaneSlot[] = []

  for (const indicatorId of validOrder) {
    const pane = paneByIndicator.get(indicatorId)
    if (pane) {
      nextSubPanes.push(pane)
      paneByIndicator.delete(indicatorId)
    }
  }

  if (nextSubPanes.length === 0) return

  for (const pane of subPanes.value) {
    if (paneByIndicator.has(pane.indicatorId)) {
      nextSubPanes.push(pane)
      paneByIndicator.delete(pane.indicatorId)
    }
  }

  const currentSubIds = subPanes.value.map((p) => p.id)
  const nextSubIds = nextSubPanes.map((p) => p.id)
  if (currentSubIds.join('|') === nextSubIds.join('|')) return

  subPanes.value = nextSubPanes

  const currentMainIndicators = activeIndicators.value.filter(
    (id) => !SUB_PANE_INDICATORS.includes(id as SubIndicatorType),
  )
  const subIndicatorOrder = subPanes.value.map((pane) => pane.indicatorId)
  activeIndicators.value = [...currentMainIndicators, ...subIndicatorOrder]

  const chart = chartRef.value
  if (!chart) return
  chart.updatePaneLayout(buildPaneLayoutIntent())
}

/* 计算总宽度：使用物理像素对齐后的值，确保与渲染一致 */
const totalWidth = computed(() => {
  const n = dataLength.value
  const dpr = viewportDpr.value

  // 使用物理像素对齐后的配置
  const { startXPx, unitPx } = getPhysicalKLineConfig(currentKWidth.value, currentKGap.value, dpr)

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
  clearAllSubPanes,
  get plugin() {
    return chartRef.value?.plugin
  },

  // Zoom Level API
  zoomToLevel: (level: number, anchorX?: number) => chartRef.value?.zoomToLevel(level, anchorX),
  zoomIn: (anchorX?: number) => chartRef.value?.zoomIn(anchorX),
  zoomOut: (anchorX?: number) => chartRef.value?.zoomOut(anchorX),
  getZoomLevel: () => chartRef.value?.getZoomLevel() ?? 1,
  getZoomLevelCount: () => chartRef.value?.getZoomLevelCount() ?? 10,
})

onMounted(() => {
  useAnchorPositioning.value =
    typeof CSS !== 'undefined' &&
    CSS.supports('anchor-name: --kmap-anchor') &&
    CSS.supports('position-anchor: --kmap-anchor')

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
      panes: [{ id: 'main', ratio: 1 }], // 初始只有主图

      // 主/副图之间真实留白，形成视觉断开
      paneGap: 0,

      // 缩放级别配置
      zoomLevels: props.zoomLevels,
      initialZoomLevel: props.initialZoomLevel,
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

  // 监听缩放级别变化
  chart.setOnZoomLevelChange((level, kWidth) => {
    emit('zoomLevelChange', level, kWidth)
  })

  // 注册主图渲染器插件
  chart.useRenderer(createGridLinesRendererPlugin()) // 网格线渲染到所有 pane
  chart.useRenderer(createExtremaMarkersRendererPlugin())
  chart.useRenderer(
    createMARendererPlugin({ ma5: true, ma10: true, ma20: true, ma30: true, ma60: true }),
  )
  chart.useRenderer(createBOLLRendererPlugin())
  chart.setRendererEnabled('boll', false) // 默认禁用，由语义化配置控制
  chart.useRenderer(createEXPMARendererPlugin())
  chart.setRendererEnabled('expma', false) // 默认禁用，由语义化配置控制
  chart.useRenderer(createENERendererPlugin())
  chart.setRendererEnabled('ene', false) // 默认禁用，由语义化配置控制
  chart.useRenderer(createCandleRenderer())
  chart.useRenderer(createLastPriceLineRendererPlugin())
  chart.useRenderer(createCustomMarkersRenderer()) // 自定义标记渲染器

  const axisWidth = props.rightAxisWidth + props.priceLabelWidth
  const getAxisCrosshair = () => {
    const pos = chart.interaction.crosshairPos
    const price = chart.interaction.crosshairPrice
    const activePaneId = chart.interaction.activePaneId
    if (pos && price !== null) {
      return { y: pos.y, price, activePaneId }
    }
    return null
  }

  // 系统渲染器插件
  chart.useRenderer(
    createYAxisRendererPlugin({
      axisWidth,
      yPaddingPx: props.yPaddingPx,
      getCrosshair: getAxisCrosshair,
    }),
  )
  // 主图指标图例（统一管理 MA、BOLL 等）
  chart.useRenderer(
    createMainIndicatorLegendRendererPlugin({
      yPaddingPx: props.yPaddingPx,
    }),
  )

  const subScaleRenderers = [
    { create: createMacdScaleRendererPlugin, paneId: 'sub_MACD' },
    { create: createRsiScaleRendererPlugin, paneId: 'sub_RSI' },
    { create: createCciScaleRendererPlugin, paneId: 'sub_CCI' },
    { create: createStochScaleRendererPlugin, paneId: 'sub_STOCH' },
    { create: createMomScaleRendererPlugin, paneId: 'sub_MOM' },
    { create: createWmsrScaleRendererPlugin, paneId: 'sub_WMSR' },
    { create: createKstScaleRendererPlugin, paneId: 'sub_KST' },
    { create: createFastkScaleRendererPlugin, paneId: 'sub_FASTK' },
  ] as const

  for (const renderer of subScaleRenderers) {
    chart.useRenderer(
      renderer.create({
        axisWidth,
        paneId: renderer.paneId,
        yPaddingPx: props.yPaddingPx,
        getCrosshair: getAxisCrosshair,
      }),
    )
  }

  chart.useRenderer(
    createCrosshairRendererPlugin({
      getCrosshairState: () => ({
        pos: chart.interaction.crosshairPos,
        activePaneId: chart.interaction.activePaneId,
        isDragging: chart.interaction.isDraggingState(),
        price: chart.interaction.crosshairPrice,
      }),
    }),
  )
  chart.useRenderer(
    createTimeAxisRendererPlugin({
      height: props.bottomAxisHeight,
      getCrosshair: () => {
        const pos = chart.interaction.crosshairPos
        const idx = chart.interaction.crosshairIndex
        if (pos && idx !== null) {
          return { x: pos.x, index: idx }
        }
        return null
      },
    }),
  )

  chart.setOnViewportChange((vp) => {
    viewportDpr.value = vp.dpr
  })
  chart.setOnPaneLayoutChange((panes) => {
    const next: Record<string, number> = {}
    for (const pane of panes) {
      next[pane.id] = pane.ratio
    }
    paneRatios.value = next
  })
  chartRef.value = chart
  chart.interaction.setTooltipAnchorPositioning(useAnchorPositioning.value)
  viewportDpr.value = chart.getCurrentDpr()
  chart.resize()

  // 初始化语义化控制器
  semanticController.value = new SemanticChartController(chart)
  semanticController.value.on('config:error', (error) => {
    console.error('Semantic config error:', error)
  })
  semanticController.value.on('config:ready', () => {
    // 数据加载完成，更新响应式数据长度
    dataLength.value = chart.getData()?.length ?? 0
    // 通知数据变化，触发 chartData computed 重新求值
    notifyDataChange()

    // 从语义化配置初始化指标状态（单向数据流：config → state → chart）
    initIndicatorsFromConfig()

    // 同步副图状态（副图由 Chart API 动态创建）
    syncSubPanesFromChart()

    nextTick(() => scrollToRight())
  })

  // 应用语义化配置（必需，会创建副图）
  semanticController.value.applyConfig(props.semanticConfig).then((result) => {
    if (result && !result.success) {
      console.error('Semantic config apply failed:', result.errors)
    }
  })

  // 注册 marker hover 回调
  chart.interaction.setOnMarkerHover((marker: MarkerEntity | null) => {
    hoveredMarker.value = marker
    scheduleRender()
  })

  // 注册自定义标记 hover 回调
  chart.interaction.setOnCustomMarkerHover((marker: CustomMarkerEntity | null) => {
    hoveredCustomMarker.value = marker
    scheduleRender()
  })

  // 保存 wheel handler，确保 onUnmounted 能正确移除
  ;(chart as any).__onWheel = onWheelHandler
})

onUnmounted(() => {
  const chart = chartRef.value
  if (chart) {
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

// 监听 yPaddingPx 变化
watch(
  () => props.yPaddingPx,
  (newVal) => {
    chartRef.value?.updateOptions({ yPaddingPx: newVal })
    scheduleRender()
  },
)

// 监听 semanticConfig 变化（唯一数据源）
watch(
  () => props.semanticConfig,
  async (newConfig, oldConfig) => {
    if (newConfig && newConfig !== oldConfig) {
      const result = await semanticController.value?.applyConfig(newConfig)
      if (result && !result.success) {
        console.error('Semantic config apply failed:', result.errors)
      }
    }
  },
  { deep: true },
)
</script>

<style scoped>
.chart-wrapper {
  /* CSS 变量支持自定义尺寸 */
  --kmap-height: var(--kmap-chart-height, 100%);
  --kmap-width: var(--kmap-chart-width, 100%);

  /* 让组件在父容器中居中显示 */
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--kmap-width);
  height: var(--kmap-height);
  min-height: 300px; /* 默认最小高度，确保容器有有效尺寸 */
  flex-direction: column;
}

.chart-container {
  position: relative;
  overflow-x: auto;
  overflow-y: hidden;
  height: 85%;
  width: 95%;
  min-height: 255px; /* 85% of 300px */
  scrollbar-width: none;
  -ms-overflow-style: none;
  border: 1px solid #e0e0e0;
  box-sizing: border-box;

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
  cursor: crosshair;
}

.chart-container.is-resizing-pane,
.chart-container.is-hovering-pane-separator {
  cursor: row-resize;
}

.chart-container:hover.is-hovering-right-axis {
  cursor: ns-resize;
}

.chart-container.is-dragging {
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

.tooltip-anchor {
  position: absolute;
  width: 1px;
  height: 1px;
  pointer-events: none;
}

.tooltip-anchor.kline-tooltip-anchor.use-anchor {
  anchor-name: --kline-tooltip-anchor;
}

.tooltip-anchor.marker-tooltip-anchor.use-anchor {
  anchor-name: --marker-tooltip-anchor;
}
</style>

<!-- 非 scoped 样式：用于动态创建的 canvas 元素 -->
<style>
/* plot canvas 基础样式 */
.plot-canvas {
  position: absolute;
  left: 0;
  top: 0;
  display: block;
}

/* 右侧价格轴 */
.right-axis {
  position: absolute;
  display: block;
}

/* 底部时间轴 */
.x-axis-canvas {
  position: absolute;
  left: 0;
  bottom: 0;
  display: block;
  z-index: 10;
}

/* 框线系统 */
.main,
.sub {
  border-right: 1px solid #e0e0e0;
  border-bottom: 1px solid #e0e0e0;
}

.x-axis-canvas {
  border-right: 1px solid #e0e0e0;
}

.right-axis {
  border-bottom: 1px solid #e0e0e0;
  border-right: 1px solid #e0e0e0;
}
</style>
