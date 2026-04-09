<template>
  <Teleport to="body">
    <div v-if="visible" class="params-overlay" @click="$emit('close')">
      <div class="indicator-params" @click.stop>
        <div class="params-header">
          <span class="params-title">{{ indicatorName }}</span>
          <button class="params-close" @click="$emit('close')">×</button>
        </div>
        <div class="params-body">
          <div v-for="param in params" :key="param.key" class="param-item">
            <label class="param-label">{{ param.label }}</label>
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
          </div>
        </div>
        <div class="params-footer">
          <button class="params-btn cancel" @click="$emit('close')">取消</button>
          <button class="params-btn confirm" @click="onConfirm">确定</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'

export interface ParamConfig {
  key: string
  label: string
  type: 'number'
  min?: number
  max?: number
  step?: number
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

// 监听 props.values 变化，同步到本地
watch(
  () => props.values,
  (newValues) => {
    localValues.value = { ...newValues }
  },
  { deep: true, immediate: true }
)

// 监听 visible 变化，重置本地值
watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      localValues.value = { ...props.values }
    }
  }
)

function onInput(key: string, event: Event) {
  const target = event.target as HTMLInputElement
  const value = parseFloat(target.value)
  if (!isNaN(value)) {
    localValues.value[key] = value
  }
}

function onConfirm() {
  emit('confirm', { ...localValues.value })
}
</script>

<style scoped>
.params-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.indicator-params {
  background: #fff;
  border: 1px solid #e8e8e8;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  min-width: 220px;
  padding: 16px;
}

.params-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid #f0f0f0;
}

.params-title {
  font-size: 14px;
  font-weight: 600;
  color: #333;
}

.params-close {
  background: none;
  border: none;
  font-size: 18px;
  color: #999;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.params-close:hover {
  color: #666;
}

.params-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.param-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.param-label {
  font-size: 13px;
  color: #666;
  flex-shrink: 0;
}

.param-input {
  width: 80px;
  padding: 4px 8px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  font-size: 13px;
  text-align: center;
}

.param-input:focus {
  outline: none;
  border-color: #1890ff;
}

.params-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
  padding-top: 8px;
  border-top: 1px solid #f0f0f0;
}

.params-btn {
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
  border: 1px solid #d9d9d9;
  background: #fff;
  transition: all 0.2s;
}

.params-btn.cancel:hover {
  border-color: #1890ff;
  color: #1890ff;
}

.params-btn.confirm {
  background: #1890ff;
  border-color: #1890ff;
  color: #fff;
}

.params-btn.confirm:hover {
  background: #40a9ff;
  border-color: #40a9ff;
}
</style>
