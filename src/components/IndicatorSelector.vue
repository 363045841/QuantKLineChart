<template>
  <div class="indicator-selector">
    <div class="indicator-scroll-container" ref="scrollContainerRef">
      <div class="indicator-list">
        <div
          v-for="indicator in indicators"
          :key="indicator.id"
          class="indicator-item"
          ref="itemRefs"
        >
          <button
            class="indicator-btn"
            :class="{ active: isActive(indicator.id) }"
            @click="toggleIndicator(indicator.id)"
            :title="indicator.name"
          >
            {{ indicator.label }}
            <span v-if="indicator.params" class="param-hint">
              ({{ getParamDisplay(indicator) }})
            </span>
          </button>
          <button
            v-if="indicator.params && isActive(indicator.id)"
            class="settings-btn"
            @click.stop="showParams(indicator.id)"
            title="编辑参数"
          >
            ⚙
          </button>
        </div>
      </div>
    </div>

    <!-- 参数编辑弹窗 -->
    <IndicatorParams
      v-if="currentIndicator"
      :visible="paramsVisible"
      :indicator-id="currentIndicator.id"
      :indicator-name="currentIndicator.name"
      :indicator-description="currentIndicator.description"
      :params="currentIndicator.params || []"
      :values="getParamValues(currentIndicator.id)"
      @close="paramsVisible = false"
      @confirm="onParamsConfirm"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import IndicatorParams, { type ParamConfig } from './IndicatorParams.vue'

export interface Indicator {
  id: string
  label: string
  name: string
  pane: 'main' | 'sub'
  /** 指标描述 */
  description?: string
  params?: ParamConfig[]
}

const indicators: Indicator[] = [
  { id: 'MA', label: 'MA', name: '均线', pane: 'main' },
  {
    id: 'BOLL',
    label: 'BOLL',
    name: '布林带',
    pane: 'main',
    description: '布林带由三条轨道线组成，用于判断价格的波动范围和趋势强度。价格触及上轨可能超买，触及下轨可能超卖。',
    params: [
      { key: 'period', label: '周期', type: 'number', min: 2, max: 100, step: 1, description: '计算移动平均线的周期数，周期越长轨道越平滑' },
      { key: 'multiplier', label: '倍数', type: 'number', min: 0.1, max: 5, step: 0.1, description: '标准差倍数，决定轨道宽度，通常为 2' },
    ],
  },
  {
    id: 'MACD',
    label: 'MACD',
    name: '指数平滑异同移动平均线',
    pane: 'sub',
    description: 'MACD 通过快慢均线的交叉判断趋势方向和动量。DIF 上穿 DEA 为金叉看涨，下穿为死叉看跌。',
    params: [
      { key: 'fastPeriod', label: '快线', type: 'number', min: 2, max: 50, step: 1, description: '快线 EMA 周期，对价格变化更敏感' },
      { key: 'slowPeriod', label: '慢线', type: 'number', min: 2, max: 100, step: 1, description: '慢线 EMA 周期，用于计算 DIF' },
      { key: 'signalPeriod', label: '信号', type: 'number', min: 2, max: 50, step: 1, description: 'DEA 的 EMA 周期，用于生成买卖信号' },
    ],
  },
  {
    id: 'RSI',
    label: 'RSI',
    name: '相对强弱指标',
    pane: 'sub',
    description: 'RSI 衡量价格变动的速度和幅度，判断超买超卖状态。RSI > 70 超买，RSI < 30 超卖。',
    params: [
      { key: 'period1', label: '周期 1', type: 'number', min: 2, max: 100, step: 1, description: '第一条 RSI 周期，通常为 6（快线）' },
      { key: 'period2', label: '周期 2', type: 'number', min: 2, max: 100, step: 1, description: '第二条 RSI 周期，通常为 12（中线）' },
      { key: 'period3', label: '周期 3', type: 'number', min: 2, max: 100, step: 1, description: '第三条 RSI 周期，通常为 24（慢线）' },
    ],
  },
  {
    id: 'CCI',
    label: 'CCI',
    name: '顺势指标',
    pane: 'sub',
    description: 'CCI 衡量价格与统计平均值的偏离程度。CCI > 100 超买，CCI < -100 超卖，适合捕捉趋势反转。',
    params: [
      { key: 'period', label: '周期', type: 'number', min: 2, max: 100, step: 1, description: '计算周期，周期越短信号越灵敏' },
    ],
  },
  {
    id: 'STOCH',
    label: 'STOCH',
    name: '随机指标',
    pane: 'sub',
    description: 'KDJ 随机指标通过比较收盘价与价格区间判断超买超卖。K > 80 超买，K < 20 超卖，K 上穿 D 金叉。',
    params: [
      { key: 'n', label: 'K 周期', type: 'number', min: 2, max: 100, step: 1, description: '计算 K 值的周期，统计 N 日内价格区间' },
      { key: 'm', label: 'D 周期', type: 'number', min: 1, max: 50, step: 1, description: 'D 值是 K 的 M 日移动平均，使信号更平滑' },
    ],
  },
  {
    id: 'MOM',
    label: 'MOM',
    name: '动量指标',
    pane: 'sub',
    description: '动量指标衡量价格变化的速度，MOM > 0 表示上涨动能，MOM < 0 表示下跌动能。适合判断趋势强度。',
    params: [
      { key: 'period', label: '周期', type: 'number', min: 2, max: 100, step: 1, description: '与多少日前价格比较，周期越短越灵敏' },
    ],
  },
  {
    id: 'WMSR',
    label: 'WMSR',
    name: '威廉指标',
    pane: 'sub',
    description: '威廉指标衡量超买超卖程度，范围为 -100 到 0。WMSR > -20 超买，WMSR < -80 超卖。',
    params: [
      { key: 'period', label: '周期', type: 'number', min: 2, max: 100, step: 1, description: '回溯周期，统计周期内最高最低价' },
    ],
  },
  {
    id: 'KST',
    label: 'KST',
    name: '确然指标',
    pane: 'sub',
    description: 'KST 综合多个 ROC 判断长期趋势，KST 上穿信号线看涨，下穿看跌。适合捕捉主要趋势转换。',
    params: [
      { key: 'roc1', label: 'ROC1', type: 'number', min: 2, max: 100, step: 1, description: '短期变化率周期' },
      { key: 'roc2', label: 'ROC2', type: 'number', min: 2, max: 100, step: 1, description: '中短期变化率周期' },
      { key: 'roc3', label: 'ROC3', type: 'number', min: 2, max: 100, step: 1, description: '中长期变化率周期' },
      { key: 'roc4', label: 'ROC4', type: 'number', min: 2, max: 100, step: 1, description: '长期变化率周期' },
      { key: 'signalPeriod', label: '信号', type: 'number', min: 2, max: 50, step: 1, description: '信号线的 SMA 周期' },
    ],
  },
  {
    id: 'FASTK',
    label: 'FASTK',
    name: '快速随机指标',
    pane: 'sub',
    description: 'FASTK 是未经过平滑处理的随机指标，比普通 KDJ 更敏感，能更快捕捉价格转折点，但假信号也更多。',
    params: [
      { key: 'period', label: '周期', type: 'number', min: 2, max: 100, step: 1, description: '计算周期，周期越短越敏感' },
    ],
  },
]

const props = defineProps<{
  /** 当前选中的指标列表 */
  activeIndicators?: string[]
  /** 指标参数配置 */
  indicatorParams?: Record<string, Record<string, number>>
}>()

const emit = defineEmits<{
  toggle: [indicatorId: string, active: boolean]
  updateParams: [indicatorId: string, params: Record<string, number>]
}>()

const scrollContainerRef = ref<HTMLDivElement | null>(null)
const paramsVisible = ref(false)
const currentIndicatorId = ref<string | null>(null)

const currentIndicator = computed(() => {
  if (!currentIndicatorId.value) return null
  return indicators.find((i) => i.id === currentIndicatorId.value) || null
})

function isActive(indicatorId: string): boolean {
  return props.activeIndicators?.includes(indicatorId) ?? false
}

function toggleIndicator(indicatorId: string) {
  const indicator = indicators.find((i) => i.id === indicatorId)
  if (!indicator) return

  const active = !isActive(indicatorId)

  if (active) {
    // 主图指标互斥：取消主图的其他指标
    if (indicator.pane === 'main') {
      indicators
        .filter((i) => i.pane === 'main' && i.id !== indicatorId && isActive(i.id))
        .forEach((i) => emit('toggle', i.id, false))
    }
    // 副图指标不互斥，可以同时显示多个

    emit('toggle', indicatorId, true)
  } else {
    emit('toggle', indicatorId, false)
  }
}

function showParams(indicatorId: string) {
  currentIndicatorId.value = indicatorId
  paramsVisible.value = true
}

function getParamValues(indicatorId: string): Record<string, number> {
  const defaultParams: Record<string, number> = {}
  const indicator = indicators.find((i) => i.id === indicatorId)
  if (indicator?.params) {
    for (const p of indicator.params) {
      // BOLL
      if (p.key === 'period' && indicatorId === 'BOLL') defaultParams[p.key] = 20
      else if (p.key === 'multiplier') defaultParams[p.key] = 2
      // MACD
      else if (p.key === 'fastPeriod') defaultParams[p.key] = 12
      else if (p.key === 'slowPeriod') defaultParams[p.key] = 26
      else if (p.key === 'signalPeriod' && indicatorId === 'MACD') defaultParams[p.key] = 9
      // RSI
      else if (p.key === 'period1') defaultParams[p.key] = 6
      else if (p.key === 'period2') defaultParams[p.key] = 12
      else if (p.key === 'period3') defaultParams[p.key] = 24
      // CCI
      else if (p.key === 'period' && indicatorId === 'CCI') defaultParams[p.key] = 14
      // STOCH
      else if (p.key === 'n') defaultParams[p.key] = 9
      else if (p.key === 'm') defaultParams[p.key] = 3
      // MOM
      else if (p.key === 'period' && indicatorId === 'MOM') defaultParams[p.key] = 10
      // WMSR
      else if (p.key === 'period' && indicatorId === 'WMSR') defaultParams[p.key] = 14
      // KST
      else if (p.key === 'roc1') defaultParams[p.key] = 10
      else if (p.key === 'roc2') defaultParams[p.key] = 15
      else if (p.key === 'roc3') defaultParams[p.key] = 20
      else if (p.key === 'roc4') defaultParams[p.key] = 30
      else if (p.key === 'signalPeriod' && indicatorId === 'KST') defaultParams[p.key] = 9
      // FASTK
      else if (p.key === 'period' && indicatorId === 'FASTK') defaultParams[p.key] = 9
    }
  }
  return {
    ...defaultParams,
    ...(props.indicatorParams?.[indicatorId] || {}),
  }
}

function getParamDisplay(indicator: Indicator): string {
  const values = getParamValues(indicator.id)
  if (!indicator.params) return ''
  return indicator.params.map((p) => values[p.key]).join(',')
}

function onParamsConfirm(values: Record<string, number>) {
  if (currentIndicatorId.value) {
    emit('updateParams', currentIndicatorId.value, values)
  }
  paramsVisible.value = false
}
</script>

<style scoped>
.indicator-selector {
  margin: 20px;
  width: 80%;
  position: relative;
}

.indicator-scroll-container {
  width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  white-space: nowrap;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  display: flex;
  justify-content: center;
}

.indicator-scroll-container::-webkit-scrollbar {
  display: none;
}

.indicator-list {
  display: flex;
  gap: 8px;
  padding: 2px;
}

.indicator-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.indicator-btn {
  flex-shrink: 0;
  padding: 6px 16px;
  border: 1px solid #e0e0e0;
  border-radius: 16px;
  background: #ffffff;
  color: #666;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.45s cubic-bezier(0.4, 0, 0.2, 1);
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 4px;
}

.indicator-btn:hover {
  background: #f8f8f8;
  border-color: #ccc;
  color: #333;
}

.indicator-btn.active {
  background: #f8f8f8;
  border-color: #ccc;
  color: #1a1a1a;
}

.indicator-btn.active:hover {
  background: #f0f0f0;
  border-color: #bbb;
}

.param-hint {
  font-size: 11px;
  opacity: 0.85;
}

.settings-btn {
  width: 24px;
  height: 24px;
  padding: 0;
  border: 1px solid #e0e0e0;
  border-radius: 50%;
  background: #fff;
  color: #999;
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.settings-btn:hover {
  border-color: #333;
  color: #333;
  background: #f8f8f8;
}
</style>
