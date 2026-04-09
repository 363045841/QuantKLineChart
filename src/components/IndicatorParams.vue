<template>
  <Teleport to="body">
    <Transition name="overlay">
      <div v-if="visible" class="params-overlay" @click="$emit('close')">
        <Transition name="modal">
          <div class="indicator-params" @click.stop>
            <!-- 头部 -->
            <div class="params-header">
              <div class="header-left">
                <span class="params-title">{{ indicatorName }}</span>
                <span class="params-subtitle">参数设置</span>
              </div>
              <button class="params-close" @click="$emit('close')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <!-- 体部 -->
            <div class="params-body">
              <div
                v-for="param in params"
                :key="param.key"
                class="param-item"
              >
                <label class="param-label">
                  <span class="param-label-text">{{ param.label }}</span>
                  <span
                    v-if="param.min !== undefined || param.max !== undefined"
                    class="param-range"
                  >
                    {{ param.min ?? '-∞' }} ~ {{ param.max ?? '+∞' }}
                  </span>
                </label>
                <div class="input-wrapper">
                  <button
                    class="stepper-btn"
                    :disabled="param.min !== undefined && localValues[param.key] <= param.min"
                    @click="step(param, -1)"
                  >
                    −
                  </button>
                  <input
                    v-if="param.type === 'number'"
                    type="number"
                    class="param-input"
                    :value="localValues[param.key]"
                    :min="param.min"
                    :max="param.max"
                    :step="param.step || 1"
                    @input="onInput(param.key, $event)"
                  />
                  <button
                    class="stepper-btn"
                    :disabled="param.max !== undefined && localValues[param.key] >= param.max"
                    @click="step(param, 1)"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            <!-- 底部 -->
            <div class="params-footer">
              <button class="params-btn reset" @click="onReset">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
                重置
              </button>
              <div class="footer-right">
                <button class="params-btn cancel" @click="$emit('close')">取消</button>
                <button class="params-btn confirm" @click="onConfirm">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                  确定
                </button>
              </div>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'

export interface ParamConfig {
  key: string
  label: string
  type: 'number'
  min?: number
  max?: number
  step?: number
  default?: number
}

const props = defineProps<{
  visible: boolean
  indicatorId: string
  indicatorName: string
  params: ParamConfig[]
  values: Record<string, number>
}>()

const emit = defineEmits<{
  close: []
  confirm: [values: Record<string, number>]
}>()

const localValues = ref<Record<string, number>>({ ...props.values })

watch(
  () => props.values,
  (newValues) => {
    localValues.value = { ...newValues }
  },
  { deep: true, immediate: true }
)

watch(
  () => props.visible,
  (visible) => {
    if (visible) localValues.value = { ...props.values }
  }
)

function onInput(key: string, event: Event) {
  const target = event.target as HTMLInputElement
  const value = parseFloat(target.value)
  if (!isNaN(value)) localValues.value[key] = value
}

function step(param: ParamConfig, direction: 1 | -1) {
  const s = param.step || 1
  let next = (localValues.value[param.key] || 0) + direction * s
  if (param.min !== undefined) next = Math.max(param.min, next)
  if (param.max !== undefined) next = Math.min(param.max, next)
  localValues.value[param.key] = parseFloat(next.toFixed(10))
}

function onReset() {
  const defaults: Record<string, number> = {}
  props.params.forEach((p) => {
    defaults[p.key] = p.default ?? props.values[p.key]
  })
  localValues.value = defaults
}

function onConfirm() {
  emit('confirm', { ...localValues.value })
}
</script>

<style scoped>
/* ── 遮罩 ── */
.params-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

/* ── 弹窗 ── */
.indicator-params {
  background: #ffffff;
  border: 1px solid #e0e0e0;
  border-radius: 12px;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.15);
  min-width: 300px;
  max-width: 380px;
  width: 90vw;
  overflow: hidden;
}

/* ── 头部 ── */
.params-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: #f8f8f8;
  border-bottom: 1px solid #e8e8e8;
}

.header-left {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.params-title {
  font-size: 14px;
  font-weight: 600;
  color: #1a1a1a;
  letter-spacing: 0.2px;
}

.params-subtitle {
  font-size: 11px;
  color: #999;
}

.params-close {
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #888;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
  padding: 0;
}

.params-close:hover {
  background: #f0f0f0;
  color: #333;
  border-color: #ccc;
}

.params-close svg {
  width: 13px;
  height: 13px;
}

/* ── 体部 ── */
.params-body {
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.param-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 14px;
  border-radius: 8px;
  background: #f8f8f8;
  border: 1px solid #e8e8e8;
  transition: border-color 0.2s;
}

.param-item:has(.param-input:focus) {
  border-color: #bbb;
}

.param-label {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.param-label-text {
  font-size: 13px;
  font-weight: 500;
  color: #333;
}

.param-range {
  font-size: 11px;
  color: #999;
}

/* ── 步进输入框 ── */
.input-wrapper {
  display: flex;
  align-items: center;
  border: 1px solid #d0d0d0;
  border-radius: 7px;
  overflow: hidden;
  background: #fff;
  transition: border-color 0.2s;
}

.input-wrapper:focus-within {
  border-color: #999;
}

.stepper-btn {
  width: 28px;
  height: 32px;
  background: #f0f0f0;
  border: none;
  cursor: pointer;
  font-size: 15px;
  font-weight: 400;
  color: #666;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, color 0.15s;
  flex-shrink: 0;
  line-height: 1;
}

.stepper-btn:hover:not(:disabled) {
  background: #e0e0e0;
  color: #333;
}

.stepper-btn:disabled {
  color: #ccc;
  cursor: not-allowed;
}

.param-input {
  width: 60px;
  height: 32px;
  border: none;
  border-left: 1px solid #e8e8e8;
  border-right: 1px solid #e8e8e8;
  font-size: 13px;
  font-weight: 600;
  text-align: center;
  color: #1a1a1a;
  background: transparent;
  -moz-appearance: textfield;
}

.param-input::-webkit-inner-spin-button,
.param-input::-webkit-outer-spin-button {
  -webkit-appearance: none;
}

.param-input:focus {
  outline: none;
}

/* ── 底部 ── */
.params-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: #f8f8f8;
  border-top: 1px solid #e8e8e8;
}

.footer-right {
  display: flex;
  gap: 8px;
}

.params-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 14px;
  border-radius: 7px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.15s;
  line-height: 1.4;
}

.params-btn svg {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
}

/* 重置 */
.params-btn.reset {
  background: transparent;
  border-color: #d0d0d0;
  color: #666;
}

.params-btn.reset:hover {
  border-color: #c0392b;
  color: #e74c3c;
  background: rgba(231, 76, 60, 0.08);
}

/* 取消 */
.params-btn.cancel {
  background: transparent;
  border-color: #d0d0d0;
  color: #666;
}

.params-btn.cancel:hover {
  background: #f0f0f0;
  color: #333;
  border-color: #bbb;
}

/* 确定 */
.params-btn.confirm {
  background: #1a1a1a;
  border-color: #1a1a1a;
  color: #fff;
}

.params-btn.confirm:hover {
  background: #333;
  border-color: #333;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.15);
  transform: translateY(-1px);
}

.params-btn.confirm:active {
  transform: translateY(0);
  box-shadow: none;
}

/* ── 动画 ── */
.overlay-enter-active,
.overlay-leave-active {
  transition: opacity 0.2s ease;
}

.overlay-enter-from,
.overlay-leave-to {
  opacity: 0;
}

.modal-enter-active {
  transition: all 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.modal-leave-active {
  transition: all 0.16s ease-in;
}

.modal-enter-from {
  opacity: 0;
  transform: scale(0.88) translateY(-16px);
}

.modal-leave-to {
  opacity: 0;
  transform: scale(0.94) translateY(8px);
}
</style>