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
  params?: ParamConfig[]
}

const indicators: Indicator[] = [
  { id: 'MA', label: 'MA', name: '均线' },
  {
    id: 'BOLL',
    label: 'BOLL',
    name: '布林带',
    params: [
      { key: 'period', label: '周期', type: 'number', min: 2, max: 100, step: 1 },
      { key: 'multiplier', label: '倍数', type: 'number', min: 0.1, max: 5, step: 0.1 },
    ],
  },
  { id: 'MACD', label: 'MACD', name: '指数平滑异同移动平均线' },
  { id: 'RSI', label: 'RSI', name: '相对强弱指标' },
  { id: 'CCI', label: 'CCI', name: '顺势指标' },
  { id: 'STOCH', label: 'STOCH', name: '随机指标' },
  { id: 'MOM', label: 'MOM', name: '动量指标' },
  { id: 'WMSR', label: 'WMSR', name: '威廉指标' },
  { id: 'KST', label: 'KST', name: '确然指标' },
  { id: 'FASTK', label: 'FASTK', name: '快速随机指标' },
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
  const active = !isActive(indicatorId)
  if (active) {
    // 单选模式：只选当前点击的指标
    emit('toggle', indicatorId, true)
    // 取消其他指标的选择
    indicators.forEach((ind) => {
      if (ind.id !== indicatorId && isActive(ind.id)) {
        emit('toggle', ind.id, false)
      }
    })
  } else {
    // 取消选择
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
      if (p.key === 'period') defaultParams[p.key] = 20
      else if (p.key === 'multiplier') defaultParams[p.key] = 2
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
  border: 1px solid #d0d0d0;
  border-radius: 16px;
  background: #ffffff;
  color: #666;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 4px;
}

.indicator-btn:hover {
  background: #f0f0f0;
  border-color: #b0b0b0;
  color: #333;
}

.indicator-btn.active {
  background: #1890ff;
  border-color: #1890ff;
  color: #ffffff;
}

.indicator-btn.active:hover {
  background: #40a9ff;
  border-color: #40a9ff;
}

.param-hint {
  font-size: 11px;
  opacity: 0.85;
}

.settings-btn {
  width: 24px;
  height: 24px;
  padding: 0;
  border: 1px solid #d0d0d0;
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
  border-color: #1890ff;
  color: #1890ff;
}
</style>
