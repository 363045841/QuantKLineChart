<template>
  <div class="app-container">
    <div class="debug-controls">
      <button @click="showModal = true">打开 Modal（模拟组件库使用场景）</button>
      <button @click="toggleEmbedSize">切换嵌入容器尺寸</button>
      <span class="size-info">嵌入尺寸：{{ embedWidth }} × {{ embedHeight }}</span>
    </div>

    <!-- 嵌入场景：模拟组件库在父容器中的使用 -->
    <div class="embed-container" :style="{ width: embedWidth, height: embedHeight }">
      <KLineChart
        :semanticConfig="currentConfig"
        :kWidth="7"
        :kGap="3"
        :yPaddingPx="24"
      />
    </div>

    <!-- Modal 场景 -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
          <div class="modal-container">
            <header class="modal-header">
              <span>K线图 Modal 测试</span>
              <button class="close-btn" @click="showModal = false">×</button>
            </header>
            <div class="modal-body">
              <KLineChart
                :semanticConfig="currentConfig"
                :kWidth="8"
                :kGap="2"
                :yPaddingPx="24"
              />
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import KLineChart from '@/components/KLineChart.vue'
import type { SemanticChartConfig } from '@/semantic'
import debugConfig from '@/semantic/debug-config.json'

const defaultConfig = debugConfig as SemanticChartConfig

const currentConfig = computed(() => defaultConfig)

// Modal 控制
const showModal = ref(false)

// 嵌入容器尺寸（模拟不同父容器尺寸）
const sizeIndex = ref(0)
const sizes = [
  { w: '95%', h: '95%' },
  { w: '800px', h: '500px' },
  { w: '600px', h: '400px' },
  { w: '100%', h: '300px' },
]

const embedWidth = computed(() => sizes[sizeIndex.value]?.w ?? '100%')
const embedHeight = computed(() => sizes[sizeIndex.value]?.h ?? '100%')

function toggleEmbedSize() {
  sizeIndex.value = (sizeIndex.value + 1) % sizes.length
}
</script>

<style>
.app-container {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.debug-controls {
  padding: 8px 16px;
  background: #f5f5f5;
  border-bottom: 1px solid #e8e8e8;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
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

.size-info {
  font-size: 13px;
  color: #666;
  font-family: monospace;
}

/* 嵌入容器 */
.embed-container {
  flex: 1;
  min-height: 0;
  border: 2px dashed #d9d9d9;
  margin: 16px;
  border-radius: 8px;
  overflow: hidden;
}

/* Modal 样式 */
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
}

.modal-container {
  width: 90%;
  height: 80%;
  max-width: 1200px;
  display: flex;
  flex-direction: column;
  background: #fff;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: #fafafa;
  border-bottom: 1px solid #e8e8e8;
  font-weight: 600;
}

.close-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  font-size: 24px;
  cursor: pointer;
  border-radius: 4px;
  color: #666;
}

.close-btn:hover {
  background: #f0f0f0;
  color: #333;
}

.modal-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* Modal 动画 */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.3s ease;
}

.modal-enter-active .modal-container,
.modal-leave-active .modal-container {
  transition: transform 0.3s ease, opacity 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal-container,
.modal-leave-to .modal-container {
  transform: scale(0.95) translateY(20px);
  opacity: 0;
}
</style>
