<template>
  <div
    v-if="k"
    :ref="onRef"
    class="kline-tooltip"
    :class="[{ 'use-anchor': useAnchor }, anchorPlacementClass]"
    :style="useAnchor ? undefined : { left: `${pos.x}px`, top: `${pos.y}px` }"
  >
    <div class="kline-tooltip__title">
      <!-- <span>{{ props.index }}</span> -->
      <span v-if="k.stockCode">{{ k.stockCode }}</span>
      <span>{{ formatShanghaiDate(k.timestamp) }}</span>
    </div>
    <div class="kline-tooltip__grid">
      <div class="row">
        <span>开</span><span :style="{ color: openColor }">{{ k.open.toFixed(2) }}</span>
      </div>
      <div class="row">
        <span>高</span><span>{{ k.high.toFixed(2) }}</span>
      </div>
      <div class="row">
        <span>低</span><span>{{ k.low.toFixed(2) }}</span>
      </div>
      <div class="row">
        <span>收</span><span :style="{ color: closeColor }">{{ k.close.toFixed(2) }}</span>
      </div>

      <div v-if="typeof k.volume === 'number'" class="row">
        <span>成交量</span><span>{{ formatWanYi(k.volume) }}</span>
      </div>
      <div v-if="typeof k.turnover === 'number'" class="row">
        <span>成交额</span><span>{{ formatWanYi(k.turnover) }}</span>
      </div>
      <div v-if="typeof k.amplitude === 'number'" class="row">
        <span>振幅</span><span>{{ k.amplitude }}%</span>
      </div>
      <div v-if="typeof k.changePercent === 'number'" class="row">
        <span>涨跌幅</span>
        <span :style="{ color: changeColor }">{{ formatSignedPercent(k.changePercent) }}</span>
      </div>
      <div v-if="typeof k.changeAmount === 'number'" class="row">
        <span>涨跌额</span>
        <span :style="{ color: changeColor }">{{ formatSignedNumber(k.changeAmount) }}</span>
      </div>
      <div v-if="typeof k.turnoverRate === 'number'" class="row">
        <span>换手率</span><span>{{ formatPercent(k.turnoverRate) }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { KLineData } from '@/types/price'
import type { ComponentPublicInstance } from 'vue'
import {
  calcChangeColor,
  calcCloseColor,
  calcOpenColor,
  formatPercent,
  formatSignedNumber,
  formatSignedPercent,
  formatWanYi,
  NEUTRAL_COLOR,
} from '@/utils/kline/format'
import { formatShanghaiDate } from '@/utils/dateFormat'

const props = defineProps<{
  k: KLineData | null
  /** 当前k在 data 中的索引 */
  index: number | null
  data: KLineData[]
  pos: { x: number; y: number }
  useAnchor?: boolean
  anchorPlacement?: 'right-bottom' | 'left-bottom'
  /** 把 tooltip 根元素回传给父组件（用于测量宽高） */
  setEl?: (el: HTMLDivElement | null) => void
}>()

const useAnchor = computed(() => props.useAnchor === true)
const anchorPlacementClass = computed(() =>
  props.anchorPlacement === 'left-bottom' ? 'anchor-left-bottom' : 'anchor-right-bottom',
)

function onRef(el: Element | ComponentPublicInstance | null) {
  props.setEl?.(el as HTMLDivElement | null)
}

const openColor = computed(() => {
  const k = props.k
  if (!k) return NEUTRAL_COLOR
  const idx = props.index
  const prev = typeof idx === 'number' && idx > 0 ? props.data[idx - 1] : undefined
  return calcOpenColor(k, prev)
})

const closeColor = computed(() => {
  const k = props.k
  if (!k) return NEUTRAL_COLOR
  return calcCloseColor(k)
})

const changeColor = computed(() => {
  const k = props.k
  if (!k) return NEUTRAL_COLOR
  return calcChangeColor(k)
})
</script>

<style scoped>
.kline-tooltip {
  position: absolute;
  z-index: 10;
  min-width: 200px;
  max-width: 260px;
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(0, 0, 0, 0.12);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.12);
  color: rgba(0, 0, 0, 0.78);
  font-size: 12px;
  line-height: 1.4;
  pointer-events: none;
  backdrop-filter: blur(6px);
}

.kline-tooltip__title {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  font-weight: 600;
  margin-bottom: 6px;
}

.kline-tooltip__grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 2px;
}

.kline-tooltip__grid .row {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}

.kline-tooltip__grid .row span:first-child {
  color: rgba(0, 0, 0, 0.56);
}

@supports (anchor-name: --kmap-anchor) and (position-anchor: --kmap-anchor) {
  .kline-tooltip.use-anchor {
    position: absolute;
    position-anchor: --kline-tooltip-anchor;
    left: anchor(left);
    top: anchor(top);
  }

  .kline-tooltip.use-anchor.anchor-right-bottom {
    transform: translate(14px, 14px);
  }

  .kline-tooltip.use-anchor.anchor-left-bottom {
    transform: translate(calc(-100% - 14px), 14px);
  }
}
</style>

