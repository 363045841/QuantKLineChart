<template>
  <div class="indicator-selector">
    <div class="indicator-scroll-container">
      <div class="indicator-list">
        <!-- 已激活的指标 -->
        <div
          v-for="indicator in activeIndicatorsList"
          :key="indicator.id"
          class="indicator-item"
        >
          <div
            class="indicator-btn-wrapper"
            @mouseenter="hoveredIndicator = indicator.id"
            @mouseleave="hoveredIndicator = null"
          >
            <button
              class="indicator-btn"
              :class="{ active: true, hovering: hoveredIndicator === indicator.id }"
            >
              <span class="btn-content">
                {{ indicator.label }}
                <span v-if="indicator.params" class="param-hint">
                  ({{ getParamDisplay(indicator) }})
                </span>
              </span>
              <!-- 悬浮操作层 -->
              <Transition name="fade">
                <div
                  v-if="hoveredIndicator === indicator.id"
                  class="hover-overlay"
                >
                  <button
                    v-if="indicator.params"
                    class="action-btn settings-btn"
                    @click.stop="showParams(indicator.id)"
                    title="编辑参数"
                  >
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                      <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
                    </svg>
                  </button>
                  <span v-if="indicator.params" class="divider"></span>
                  <button
                    class="action-btn remove-btn"
                    @click.stop="removeIndicator(indicator.id)"
                    title="移除指标"
                  >
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                    </svg>
                  </button>
                </div>
              </Transition>
            </button>
          </div>
        </div>

        <!-- 添加按钮 -->
        <div class="indicator-item">
          <button
            ref="addBtnRef"
            class="add-btn"
            @click="toggleAddMenu"
            title="添加指标"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- 添加指标菜单（使用 Teleport 解决层级问题） -->
    <Teleport to="body">
      <Transition name="slide">
        <div
          v-if="showAddMenu"
          class="add-menu"
          ref="addMenuRef"
          :style="menuStyle"
        >
          <div class="menu-section">
            <div class="menu-title">主图指标</div>
            <div class="menu-items">
              <button
                v-for="indicator in mainIndicators"
                :key="indicator.id"
                class="menu-item"
                :class="{ disabled: isActive(indicator.id) }"
                :disabled="isActive(indicator.id)"
                @click="addIndicator(indicator.id)"
              >
                {{ indicator.label }}
                <span v-if="indicator.params" class="param-hint">
                  ({{ indicator.name }})
                </span>
                <span v-if="isActive(indicator.id)" class="active-tag">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                  </svg>
                </span>
              </button>
            </div>
          </div>
          <div class="menu-section">
            <div class="menu-title">副图指标</div>
            <div class="menu-items">
              <button
                v-for="indicator in subIndicators"
                :key="indicator.id"
                class="menu-item"
                :class="{ disabled: isActive(indicator.id) }"
                :disabled="isActive(indicator.id)"
                @click="addIndicator(indicator.id)"
              >
                {{ indicator.label }}
                <span v-if="indicator.params" class="param-hint">
                  ({{ indicator.name }})
                </span>
                <span v-if="isActive(indicator.id)" class="active-tag">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                  </svg>
                </span>
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

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
import { ref, computed, onMounted, onUnmounted } from 'vue'
import IndicatorParams, { type ParamConfig } from './IndicatorParams.vue'

export interface Indicator {
  id: string
  label: string
  name: string
  pane: 'main' | 'sub'
  description?: string
  params?: ParamConfig[]
}

// ─────────────────────────────────────────────────────────────────
// 静态数据定义（提取到模块作用域，避免重复计算）
// ─────────────────────────────────────────────────────────────────
const allIndicators: Indicator[] = [
  { id: 'MA', label: 'MA', name: '均线', pane: 'main' },
  {
    id: 'BOLL',
    label: 'BOLL',
    name: '布林带',
    pane: 'main',
    description: '布林带由三条轨道线组成，用于判断价格的波动范围和趋势强度。价格触及上轨可能超买，触及下轨可能超卖。',
    params: [
      { key: 'period', label: '周期', type: 'number', min: 2, max: 100, step: 1, default: 20, description: '计算移动平均线的周期数，周期越长轨道越平滑' },
      { key: 'multiplier', label: '倍数', type: 'number', min: 0.1, max: 5, step: 0.1, default: 2, description: '标准差倍数，决定轨道宽度，通常为 2' },
    ],
  },
  {
    id: 'MACD',
    label: 'MACD',
    name: '指数平滑异同移动平均线',
    pane: 'sub',
    description: 'MACD 通过快慢均线的交叉判断趋势方向和动量。DIF 上穿 DEA 为金叉看涨，下穿为死叉看跌。',
    params: [
      { key: 'fastPeriod', label: '快线', type: 'number', min: 2, max: 50, step: 1, default: 12, description: '快线 EMA 周期，对价格变化更敏感' },
      { key: 'slowPeriod', label: '慢线', type: 'number', min: 2, max: 100, step: 1, default: 26, description: '慢线 EMA 周期，用于计算 DIF' },
      { key: 'signalPeriod', label: '信号', type: 'number', min: 2, max: 50, step: 1, default: 9, description: 'DEA 的 EMA 周期，用于生成买卖信号' },
    ],
  },
  {
    id: 'RSI',
    label: 'RSI',
    name: '相对强弱指标',
    pane: 'sub',
    description: 'RSI 衡量价格变动的速度和幅度，判断超买超卖状态。RSI > 70 超买，RSI < 30 超卖。',
    params: [
      { key: 'period1', label: '周期 1', type: 'number', min: 2, max: 100, step: 1, default: 6, description: '第一条 RSI 周期，通常为 6（快线）' },
      { key: 'period2', label: '周期 2', type: 'number', min: 2, max: 100, step: 1, default: 12, description: '第二条 RSI 周期，通常为 12（中线）' },
      { key: 'period3', label: '周期 3', type: 'number', min: 2, max: 100, step: 1, default: 24, description: '第三条 RSI 周期，通常为 24（慢线）' },
    ],
  },
  {
    id: 'CCI',
    label: 'CCI',
    name: '顺势指标',
    pane: 'sub',
    description: 'CCI 衡量价格与统计平均值的偏离程度。CCI > 100 超买，CCI < -100 超卖，适合捕捉趋势反转。',
    params: [
      { key: 'period', label: '周期', type: 'number', min: 2, max: 100, step: 1, default: 14, description: '计算周期，周期越短信号越灵敏' },
    ],
  },
  {
    id: 'STOCH',
    label: 'STOCH',
    name: '随机指标',
    pane: 'sub',
    description: 'KDJ 随机指标通过比较收盘价与价格区间判断超买超卖。K > 80 超买，K < 20 超卖，K 上穿 D 金叉。',
    params: [
      { key: 'n', label: 'K 周期', type: 'number', min: 2, max: 100, step: 1, default: 9, description: '计算 K 值的周期，统计 N 日内价格区间' },
      { key: 'm', label: 'D 周期', type: 'number', min: 1, max: 50, step: 1, default: 3, description: 'D 值是 K 的 M 日移动平均，使信号更平滑' },
    ],
  },
  {
    id: 'MOM',
    label: 'MOM',
    name: '动量指标',
    pane: 'sub',
    description: '动量指标衡量价格变化的速度，MOM > 0 表示上涨动能，MOM < 0 表示下跌动能。适合判断趋势强度。',
    params: [
      { key: 'period', label: '周期', type: 'number', min: 2, max: 100, step: 1, default: 10, description: '与多少日前价格比较，周期越短越灵敏' },
    ],
  },
  {
    id: 'WMSR',
    label: 'WMSR',
    name: '威廉指标',
    pane: 'sub',
    description: '威廉指标衡量超买超卖程度，范围为 -100 到 0。WMSR > -20 超买，WMSR < -80 超卖。',
    params: [
      { key: 'period', label: '周期', type: 'number', min: 2, max: 100, step: 1, default: 14, description: '回溯周期，统计周期内最高最低价' },
    ],
  },
  {
    id: 'KST',
    label: 'KST',
    name: '确然指标',
    pane: 'sub',
    description: 'KST 综合多个 ROC 判断长期趋势，KST 上穿信号线看涨，下穿看跌。适合捕捉主要趋势转换。',
    params: [
      { key: 'roc1', label: 'ROC1', type: 'number', min: 2, max: 100, step: 1, default: 10, description: '短期变化率周期' },
      { key: 'roc2', label: 'ROC2', type: 'number', min: 2, max: 100, step: 1, default: 15, description: '中短期变化率周期' },
      { key: 'roc3', label: 'ROC3', type: 'number', min: 2, max: 100, step: 1, default: 20, description: '中长期变化率周期' },
      { key: 'roc4', label: 'ROC4', type: 'number', min: 2, max: 100, step: 1, default: 30, description: '长期变化率周期' },
      { key: 'signalPeriod', label: '信号', type: 'number', min: 2, max: 50, step: 1, default: 9, description: '信号线的 SMA 周期' },
    ],
  },
  {
    id: 'FASTK',
    label: 'FASTK',
    name: '快速随机指标',
    pane: 'sub',
    description: 'FASTK 是未经过平滑处理的随机指标，比普通 KDJ 更敏感，能更快捕捉价格转折点，但假信号也更多。',
    params: [
      { key: 'period', label: '周期', type: 'number', min: 2, max: 100, step: 1, default: 9, description: '计算周期，周期越短越敏感' },
    ],
  },
]

// 静态筛选结果
const mainIndicators = allIndicators.filter((i) => i.pane === 'main')
const subIndicators = allIndicators.filter((i) => i.pane === 'sub')

// ─────────────────────────────────────────────────────────────────
// Props & Emits
// ─────────────────────────────────────────────────────────────────
const props = defineProps<{
  activeIndicators?: string[]
  indicatorParams?: Record<string, Record<string, number>>
}>()

const emit = defineEmits<{
  toggle: [indicatorId: string, active: boolean]
  updateParams: [indicatorId: string, params: Record<string, number>]
}>()

// ─────────────────────────────────────────────────────────────────
// 响应式状态
// ─────────────────────────────────────────────────────────────────
const addBtnRef = ref<HTMLButtonElement | null>(null)
const addMenuRef = ref<HTMLDivElement | null>(null)
const paramsVisible = ref(false)
const currentIndicatorId = ref<string | null>(null)
const hoveredIndicator = ref<string | null>(null)
const showAddMenu = ref(false)
const menuStyle = ref<{ left: string; bottom: string }>({ left: '0', bottom: '0' })

// ─────────────────────────────────────────────────────────────────
// 计算属性
// ─────────────────────────────────────────────────────────────────
const activeIndicatorsList = computed(() => {
  if (!props.activeIndicators?.length) return []
  // 保持用户添加的顺序，而不是 allIndicators 的原始顺序
  return props.activeIndicators
    .map((id) => allIndicators.find((i) => i.id === id))
    .filter((i): i is Indicator => i !== undefined)
})

const currentIndicator = computed(() => {
  if (!currentIndicatorId.value) return null
  return allIndicators.find((i) => i.id === currentIndicatorId.value) || null
})

// ─────────────────────────────────────────────────────────────────
// 方法
// ─────────────────────────────────────────────────────────────────
function isActive(indicatorId: string): boolean {
  return props.activeIndicators?.includes(indicatorId) ?? false
}

function addIndicator(indicatorId: string) {
  if (isActive(indicatorId)) return

  const indicator = allIndicators.find((i) => i.id === indicatorId)
  if (!indicator) return

  // 主图指标互斥：取消主图的其他指标
  if (indicator.pane === 'main') {
    allIndicators
      .filter((i) => i.pane === 'main' && i.id !== indicatorId && isActive(i.id))
      .forEach((i) => emit('toggle', i.id, false))
  }

  emit('toggle', indicatorId, true)
  showAddMenu.value = false
}

function removeIndicator(indicatorId: string) {
  emit('toggle', indicatorId, false)
}

function showParams(indicatorId: string) {
  currentIndicatorId.value = indicatorId
  paramsVisible.value = true
}

/**
 * 获取指标参数值（基于配置的 default 字段，消除硬编码）
 */
function getParamValues(indicatorId: string): Record<string, number> {
  const indicator = allIndicators.find((i) => i.id === indicatorId)
  if (!indicator?.params) return {}

  const defaultParams: Record<string, number> = {}
  for (const p of indicator.params) {
    defaultParams[p.key] = p.default ?? p.min ?? 1
  }

  return {
    ...defaultParams,
    ...(props.indicatorParams?.[indicatorId] || {}),
  }
}

function getParamDisplay(indicator: Indicator): string {
  const values = getParamValues(indicator.id)
  if (!indicator.params) return ''
  return indicator.params.map((p) => values[p.key] ?? '').join(',')
}

function onParamsConfirm(values: Record<string, number>) {
  if (currentIndicatorId.value) {
    emit('updateParams', currentIndicatorId.value, values)
  }
  paramsVisible.value = false
}

// 切换菜单显示
function toggleAddMenu() {
  if (!showAddMenu.value && addBtnRef.value) {
    const btnRect = addBtnRef.value.getBoundingClientRect()
    const viewportWidth = window.innerWidth

    // 计算按钮中心位置
    let left = btnRect.left + btnRect.width / 2

    // 边界检测：假设菜单最大宽度 320px，检查右侧空间
    const estimatedMenuWidth = 320
    const halfMenuWidth = estimatedMenuWidth / 2

    // 如果右侧空间不足，调整位置
    if (left + halfMenuWidth > viewportWidth - 8) {
      left = viewportWidth - halfMenuWidth - 8
    }
    // 如果左侧空间不足，调整位置
    if (left - halfMenuWidth < 8) {
      left = halfMenuWidth + 8
    }

    menuStyle.value = {
      left: `${left}px`,
      bottom: `${window.innerHeight - btnRect.top + 8}px`,
    }
  }
  showAddMenu.value = !showAddMenu.value
}

// 点击外部关闭菜单
function handleClickOutside(event: MouseEvent) {
  const clickedOutsideMenu = addMenuRef.value && !addMenuRef.value.contains(event.target as Node)
  const clickedOutsideBtn = addBtnRef.value && !addBtnRef.value.contains(event.target as Node)

  if (clickedOutsideMenu && clickedOutsideBtn) {
    showAddMenu.value = false
  }
}

// 窗口大小变化时关闭菜单
function handleResize() {
  if (showAddMenu.value) {
    showAddMenu.value = false
  }
}

// ─────────────────────────────────────────────────────────────────
// 生命周期
// ─────────────────────────────────────────────────────────────────
onMounted(() => {
  document.addEventListener('click', handleClickOutside)
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
  window.removeEventListener('resize', handleResize)
})
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
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
  text-align: center;
}

.indicator-scroll-container::-webkit-scrollbar {
  display: none;
}

.indicator-list {
  display: inline-flex;
  gap: 8px;
  padding: 2px;
  margin: 0 auto;
}

.indicator-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.indicator-btn-wrapper {
  position: relative;
}

.indicator-btn {
  position: relative;
  flex-shrink: 0;
  padding: 6px 16px;
  border: 1px solid #e0e0e0;
  border-radius: 16px;
  background: #ffffff;
  color: #666;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s ease;
  white-space: nowrap;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  overflow: hidden;
}

.indicator-btn:hover:not(.hovering) {
  background: #f8f8f8;
  border-color: #ccc;
  color: #333;
}

.indicator-btn.active {
  background: #f8f8f8;
  border-color: #1a1a1a;
  color: #1a1a1a;
}

.indicator-btn.active:hover:not(.hovering) {
  background: #f0f0f0;
  border-color: #333;
}

.btn-content {
  position: relative;
  z-index: 1;
}

.param-hint {
  font-size: 11px;
  opacity: 0.85;
}

/* 悬浮操作层 */
.hover-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(4px);
  border-radius: 16px;
  z-index: 2;
}

.action-btn {
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: #666;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.action-btn:hover {
  background: rgba(0, 0, 0, 0.06);
  color: #333;
}

.settings-btn:hover {
  color: #1a1a1a;
}

.remove-btn:hover {
  color: #ff4d4f;
}

.divider {
  width: 1px;
  height: 14px;
  background: #e0e0e0;
}

/* 添加按钮 */
.add-btn {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px dashed #d9d9d9;
  border-radius: 50%;
  background: transparent;
  color: #999;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
}

.add-btn:hover {
  border-color: #1a1a1a;
  color: #1a1a1a;
  background: rgba(26, 26, 26, 0.04);
}

/* 添加菜单 */
.add-menu {
  position: fixed;
  transform: translateX(-50%);
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 6px 16px 0 rgba(0, 0, 0, 0.08), 0 3px 6px -4px rgba(0, 0, 0, 0.12), 0 9px 28px 8px rgba(0, 0, 0, 0.05);
  padding: 8px 0;
  white-space: nowrap;
  z-index: 9999;
}

.menu-section {
  padding: 4px 0;
}

.menu-section:not(:last-child) {
  border-bottom: 1px solid #f0f0f0;
}

.menu-title {
  padding: 4px 16px;
  font-size: 12px;
  color: #999;
  font-weight: 500;
}

.menu-items {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.menu-item {
  width: 100%;
  padding: 8px 16px;
  border: none;
  background: transparent;
  text-align: left;
  font-size: 13px;
  color: #333;
  cursor: pointer;
  transition: background 0.2s;
  display: flex;
  align-items: center;
  gap: 8px;
}

.menu-item:hover:not(.disabled) {
  background: #f5f5f5;
}

.menu-item.disabled {
  color: #999;
  cursor: not-allowed;
}

.menu-item .param-hint {
  font-size: 11px;
  color: #999;
}

.active-tag {
  margin-left: auto;
  color: #1a1a1a;
  display: flex;
  align-items: center;
}

/* 过渡动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.slide-enter-active,
.slide-leave-active {
  transition: all 0.2s ease;
}

.slide-enter-from,
.slide-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(8px);
}
</style>
