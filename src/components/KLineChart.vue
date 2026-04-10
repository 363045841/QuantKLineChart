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
import { createMARendererPlugin } from '@/core/renderers/Indicator/ma'
import { createExtremaMarkersRendererPlugin } from '@/core/renderers/extremaMarkers'
import { createVolumeRendererPlugin } from '@/core/renderers/subVolume'
import { createYAxisRendererPlugin } from '@/core/renderers/yAxis'
import { createTimeAxisRendererPlugin } from '@/core/renderers/timeAxis'
import { createCrosshairRendererPlugin } from '@/core/renderers/crosshair'
import { createMALegendRendererPlugin } from '@/core/renderers/Indicator/maLegend'
import { createGlobalBordersRendererPlugin } from '@/core/renderers/globalBorders'
import { createPaneTitleRendererPlugin } from '@/core/renderers/paneTitle'
import { createBOLLRendererPlugin } from '@/core/renderers/Indicator/boll'
import { createBOLLLegendRendererPlugin } from '@/core/renderers/Indicator/bollLegend'
import { createMACDRendererPlugin } from '@/core/renderers/Indicator/macd'
import { createMACDLegendRendererPlugin } from '@/core/renderers/Indicator/macdLegend'
import { createRSIRendererPlugin } from '@/core/renderers/Indicator/rsi'
import { createCCIRendererPlugin } from '@/core/renderers/Indicator/cci'
import { createSTOCHRendererPlugin } from '@/core/renderers/Indicator/stoch'
import { createMOMRendererPlugin } from '@/core/renderers/Indicator/mom'
import { createWMSRRendererPlugin } from '@/core/renderers/Indicator/wmsr'
import { createKSTRendererPlugin } from '@/core/renderers/Indicator/kst'
import { createFASTKRendererPlugin } from '@/core/renderers/Indicator/fastk'

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

const tooltipRef = ref<HTMLDivElement | null>(null)

function setTooltipEl(el: HTMLDivElement | null) {
  tooltipRef.value = el
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
    hoveredMarker.value = null
    return
  }

  hoveredIdx.value = interaction.hoveredIndex ?? null
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

// 副图指标列表（互斥）
const SUB_PANE_INDICATORS = ['MACD', 'RSI', 'CCI', 'STOCH', 'MOM', 'WMSR', 'KST', 'FASTK'] as const

// 指标切换处理
function handleIndicatorToggle(indicatorId: string, active: boolean) {
  if (active) {
    if (!activeIndicators.value.includes(indicatorId)) {
      activeIndicators.value.push(indicatorId)
    }
  } else {
    activeIndicators.value = activeIndicators.value.filter((id) => id !== indicatorId)
  }

  // 更新 MA 显示配置
  if (indicatorId === 'MA') {
    chartRef.value?.updateRendererConfig('ma', {
      ma5: active,
      ma10: active,
      ma20: active,
      ma30: active,
      ma60: active,
    })
    chartRef.value?.setRendererEnabled('maLegend', active)
  }

  // 更新 BOLL 显示配置
  if (indicatorId === 'BOLL') {
    chartRef.value?.setRendererEnabled('boll', active)
    chartRef.value?.setRendererEnabled('bollLegend', active)
  }

  // 副图指标互斥处理
  if (SUB_PANE_INDICATORS.includes(indicatorId as any)) {
    // 先禁用所有副图指标
    const allSubIndicators = ['macd', 'rsi', 'cci', 'stoch', 'mom', 'wmsr', 'kst', 'fastk']
    allSubIndicators.forEach(name => {
      chartRef.value?.setRendererEnabled(name, false)
    })

    if (active) {
      // 禁用成交量，启用当前指标
      chartRef.value?.setRendererEnabled('volume', false)

      // 根据指标 ID 启用对应的渲染器
      const rendererName = indicatorId.toLowerCase()
      chartRef.value?.setRendererEnabled(rendererName, true)
      chartRef.value?.updateRendererConfig('paneTitle_sub', { title: indicatorId })
    } else {
      // 如果没有其他副图指标启用，恢复成交量
      const hasOtherSubIndicator = activeIndicators.value.some(id =>
        SUB_PANE_INDICATORS.includes(id as any)
      )
      if (!hasOtherSubIndicator) {
        chartRef.value?.setRendererEnabled('volume', true)
        chartRef.value?.updateRendererConfig('paneTitle_sub', { title: 'VOL' })
      }
    }
  }

  scheduleRender()
}

// 指标参数更新处理
function handleUpdateParams(indicatorId: string, params: Record<string, number>) {
  // 保存参数配置
  indicatorParams.value[indicatorId] = params

  // 更新 BOLL 参数
  if (indicatorId === 'BOLL') {
    chartRef.value?.updateRendererConfig('boll', params)
    chartRef.value?.updateRendererConfig('bollLegend', params)
  }

  // 更新 MACD 参数
  if (indicatorId === 'MACD') {
    chartRef.value?.updateRendererConfig('macd', params)
    chartRef.value?.updateRendererConfig('macdLegend', params)
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
  get plugin() {
    return chartRef.value?.plugin
  },
})

onMounted(() => {
  const container = containerRef.value
  const canvasLayer = canvasLayerRef.value
  const xAxisCanvas = xAxisCanvasRef.value
  if (!container || !canvasLayer || !xAxisCanvas) return

  // 注册 marker hover 回调
  chartRef.value?.interaction.setOnMarkerHover((marker: MarkerEntity | null) => {
    hoveredMarker.value = marker
    scheduleRender()
  })

  // 手动添加 wheel 事件监听器，设置 passive: false 以允许 preventDefault()
  const onWheelHandler = (e: WheelEvent) => {
    chartRef.value?.interaction.onWheel(e)
    syncHoverState()
  }
  container.addEventListener('wheel', onWheelHandler, { passive: false })

  const panes: PaneSpec[] = [
    { id: 'main', ratio: props.paneRatios[0] },
    { id: 'sub', ratio: props.paneRatios[1] },
  ]

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
      panes,

      // 主/副图之间真实留白，形成视觉断开
      paneGap: 0,
    },
  )

  // 缩放回调：同步 kWidth/kGap -> 等 DOM 更新 scrollWidth -> 再设置 scrollLeft
  chart.setOnZoomChange(async (kWidth, kGap, targetScrollLeft) => {
    currentKWidth.value = kWidth
    currentKGap.value = kGap

    // 1) 等 Vue 更新 scroll-content width
    await nextTick()
    // 2) 再等一帧，确保浏览器完成布局并刷新 scrollWidth
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

    const c = containerRef.value
    if (!c) return
    const maxScrollLeft = Math.max(0, c.scrollWidth - c.clientWidth)
    c.scrollLeft = Math.min(Math.max(0, targetScrollLeft), maxScrollLeft)
    scheduleRender()
  })

  // 注册渲染器插件
  chart.useRenderer(createGridLinesRendererPlugin()) // 网格线渲染到所有 pane
  chart.useRenderer(createExtremaMarkersRendererPlugin())
  chart.useRenderer(createMARendererPlugin(props.showMA))
  chart.useRenderer(createBOLLRendererPlugin())
  chart.setRendererEnabled('boll', false) // 默认禁用，点击按钮启用
  chart.useRenderer(createCandleRenderer())
  chart.useRenderer(createLastPriceLineRendererPlugin())
  chart.useRenderer(createVolumeRendererPlugin())
  chart.useRenderer(createPaneTitleRendererPlugin({
    paneId: 'sub',
    title: 'VOL',
  }))

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
  chart.useRenderer(createMACDRendererPlugin())
  chart.setRendererEnabled('macd', false) // 默认禁用，点击按钮启用
  chart.useRenderer(createMACDLegendRendererPlugin({
    yPaddingPx: props.yPaddingPx,
  }))
  chart.setRendererEnabled('macdLegend', false) // 默认禁用，点击按钮启用

  // 其他副图指标渲染器（默认禁用）
  chart.useRenderer(createRSIRendererPlugin())
  chart.setRendererEnabled('rsi', false)
  chart.useRenderer(createCCIRendererPlugin())
  chart.setRendererEnabled('cci', false)
  chart.useRenderer(createSTOCHRendererPlugin())
  chart.setRendererEnabled('stoch', false)
  chart.useRenderer(createMOMRendererPlugin())
  chart.setRendererEnabled('mom', false)
  chart.useRenderer(createWMSRRendererPlugin())
  chart.setRendererEnabled('wmsr', false)
  chart.useRenderer(createKSTRendererPlugin())
  chart.setRendererEnabled('kst', false)
  chart.useRenderer(createFASTKRendererPlugin())
  chart.setRendererEnabled('fastk', false)

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

  // 测试插件
  chart.plugin.use({
    name: 'debug',
    version: '1.0.0',
    install(host) {
      console.log('[Debug Plugin] 已安装')
      host.events.on('chart:draw', () => {
        console.log('[Debug Plugin] chart draw event')
      })
    }
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
  height: 80%;
  width: 80%;
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
