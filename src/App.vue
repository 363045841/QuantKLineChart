<template>
  <div class="app-container">
    <div class="debug-controls">
      <div class="debug-left">
        <button @click="showModal = true" title="打开 Modal">
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M9 3v18M3 9h6" />
          </svg>
        </button>
        <button @click="toggleEmbedSize" title="切换嵌入容器尺寸">
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
          </svg>
        </button>
      </div>
      <div class="debug-center">
        <span class="size-info">嵌入尺寸：{{ embedWidth }} × {{ embedHeight }}</span>
      </div>
      <div class="debug-right">
        <span class="version-badge">v{{ packageVersion }}</span>
        <a
          class="debug-link"
          href="https://github.com/363045841/KLineChartQuant"
          target="_blank"
          rel="noopener noreferrer"
          title="GitHub"
          aria-label="GitHub"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
            <path
              d="M12 0C5.37 0 0 5.37 0 12a12 12 0 0 0 8.2 11.4c.6.1.82-.26.82-.58 0-.28-.01-1.03-.02-2.02-3.34.73-4.04-1.61-4.04-1.61-.55-1.38-1.33-1.75-1.33-1.75-1.1-.75.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.08 1.84 2.83 1.3 3.52.99.1-.78.42-1.3.76-1.6-2.67-.3-5.47-1.34-5.47-5.95 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.53.12-3.18 0 0 1-.32 3.3 1.23A11.5 11.5 0 0 1 12 5.8c1.02 0 2.04.14 3 .42 2.3-1.56 3.3-1.23 3.3-1.23.66 1.65.25 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.62-2.8 5.64-5.48 5.95.43.37.82 1.1.82 2.22 0 1.6-.01 2.9-.01 3.3 0 .32.22.69.82.57A12 12 0 0 0 24 12c0-6.63-5.37-12-12-12z"
            />
          </svg>
        </a>
        <a
          class="debug-link"
          href="https://www.npmjs.com/package/@363045841yyt/klinechart?activeTab=readme"
          target="_blank"
          rel="noopener noreferrer"
          title="NPM"
          aria-label="NPM"
        >
          <svg viewBox="0 0 1024 1024" width="20" height="20" aria-hidden="true">
            <path
              d="M0 312.928v341.344h284.416v56.832H512v-56.832h512V312.928z m284.416 284.32H227.584v-170.656h-56.96v170.656H56.96v-227.456h227.456z m170.656 0v56.992h-113.696v-284.448h227.584v227.488h-113.888z m512.064 0H910.4v-170.656h-56.992v170.656h-56.96v-170.656h-56.736v170.656h-113.952v-227.456h341.408zM455.04 426.656H512v113.792h-56.96z"
              fill="#CB3837"
            />
          </svg>
        </a>
      </div>
    </div>

    <!-- 嵌入场景：模拟组件库在父容器中的使用 -->
    <div class="embed-container" :style="{ width: embedWidth, height: embedHeight }">
      <KLineChart :semanticConfig="currentConfig" :kWidth="7" :kGap="3" :yPaddingPx="24" />
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
              <KLineChart :semanticConfig="currentConfig" :kWidth="8" :kGap="2" :yPaddingPx="24" />
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
import packageJson from '../package.json'

const defaultConfig = debugConfig as SemanticChartConfig

const currentConfig = computed(() => defaultConfig)
const packageVersion = packageJson.version

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
  position: relative;
  padding: 8px 16px;
  background: #f5f5f5;
  border-bottom: 1px solid #e8e8e8;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  align-self: stretch;
}

.debug-left,
.debug-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.debug-center {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
}

.debug-link {
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #d9d9d9;
  border-radius: 6px;
  background: #fff;
  color: #333;
  text-decoration: none;
}

.debug-link:hover {
  color: #1890ff;
  border-color: #1890ff;
}

.version-badge {
  padding: 2px 8px;
  border-radius: 12px;
  border: 1px solid #d9d9d9;
  background: #fff;
  color: #666;
  font-size: 12px;
  font-family: monospace;
}

.debug-controls button {
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid #d9d9d9;
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.debug-controls button:hover {
  border-color: #1890ff;
  color: #1890ff;
}

/* 移动端适配 */
@media (max-width: 640px) {
  .debug-controls {
    flex-wrap: wrap;
    gap: 8px;
    padding: 8px 12px;
    justify-content: flex-start;
  }

  .debug-left {
    gap: 4px;
  }

  .debug-center {
    position: static;
    transform: none;
    width: 100%;
    text-align: center;
    order: 1;
  }

  .debug-right {
    gap: 4px;
    margin-left: auto;
    order: 0;
  }
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
  transition:
    transform 0.3s ease,
    opacity 0.3s ease;
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
