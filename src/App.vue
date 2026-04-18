<template>
  <div class="app-container">
    <div class="debug-controls">
      <button @click="toggleConfig">
        切换配置（当前：{{ currentConfigName }}）
      </button>
    </div>
    <KLineChart
      :semanticConfig="currentConfig"
      :kWidth="7"
      :kGap="3"
      :yPaddingPx="24"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import KLineChart from '@/components/KLineChart.vue'
import type { SemanticChartConfig } from '@/semantic'
import debugConfig from '@/semantic/debug-config.json'

// 默认配置（debug-config.json）
const defaultConfig = debugConfig as SemanticChartConfig

// 备用配置（演示切换）
const alternativeConfig: SemanticChartConfig = {
  version: '1.0.0',
  data: {
    source: 'baostock',
    symbol: '600519',
    exchange: 'SH',
    startDate: '2024-06-01',
    endDate: '2026-04-18',
    period: 'daily',
    adjust: 'qfq',
  },
  indicators: {
    main: [
      { type: 'MA', enabled: true, params: { periods: [5, 10, 20] } },
    ],
    sub: [
      { type: 'MACD', enabled: true },
    ],
  },
}

const useAlternative = ref(false)

const currentConfig = computed(() =>
  useAlternative.value ? alternativeConfig : defaultConfig
)

const currentConfigName = computed(() =>
  useAlternative.value ? '600519 贵州茅台' : '601369 陕鼓动力'
)

function toggleConfig() {
  useAlternative.value = !useAlternative.value
}
</script>

<style>
.app-container {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.debug-controls {
  padding: 8px 16px;
  background: #f5f5f5;
  border-bottom: 1px solid #e8e8e8;
  display: flex;
  align-items: center;
  gap: 12px;
}

.debug-controls button {
  padding: 6px 16px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
  font-size: 14px;
}

.debug-controls button:hover {
  border-color: #1890ff;
  color: #1890ff;
}
</style>
